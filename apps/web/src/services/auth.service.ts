/**
 * AuthService: SIWE nonce + verify → 成功後に user.store へ JWT を保存
 * signOut / isAuthenticated を提供
 */

import { getApiBaseUrl } from './config';
import { useUserStore } from '../models/stores/user.store';
import { getAddress } from 'viem';

const API_BASE = getApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);

/**
 * EIP-4361 準拠の SIWE メッセージを組み立てる
 * バックエンドの siwe パッケージがパースできるよう、英語の定型句と address 行を含める
 */
function buildSiweMessage(params: {
  address: string;
  nonce: string;
  chainId: number;
  domain: string;
  uri: string;
}): string {
  const { address, nonce, chainId, domain, uri } = params;
  const issuedAt = new Date().toISOString();
  return [
    `${domain} wants you to sign in with your Ethereum account:`,
    address,
    '',
    'Sign in to Node Stay.',
    '',
    `URI: ${uri}`,
    `Version: 1`,
    `Chain ID: ${chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join('\n');
}

function normalizeChainId(chainId: number): number {
  return Number.isInteger(chainId) && chainId > 0 ? chainId : 137;
}

export interface SignInParams {
  walletAddress: `0x${string}`;
  chainId: number;
  signMessage: (message: string) => Promise<string>;
}

class AuthServiceClass {
  /**
   * SIWE ログインを実行：nonce 取得 → メッセージ構築 → 署名 → 検証 → JWT 保存
   */
  async signIn(params: SignInParams): Promise<void> {
    const { walletAddress: rawAddress, chainId: targetChainId, signMessage } = params;
    const address = getAddress(rawAddress);

    const nonceRes = await fetch(`${API_BASE}/v1/auth/nonce?address=${address}`);
    if (!nonceRes.ok) throw new Error('nonce の取得に失敗しました');
    const { nonce } = (await nonceRes.json()) as { nonce: string };

    const domain = typeof window !== 'undefined' ? window.location.host : 'localhost:3000';
    const uri = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const message = buildSiweMessage({
      address,
      nonce,
      chainId: normalizeChainId(targetChainId),
      domain,
      uri,
    });
    const signature = await signMessage(message);

    const verifyRes = await fetch(`${API_BASE}/v1/auth/verify`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message, signature }),
    });
    if (!verifyRes.ok) {
      const err = (await verifyRes.json().catch(() => ({}))) as { message?: string };
      throw new Error(err.message ?? '認証に失敗しました');
    }
    const { token } = (await verifyRes.json()) as { token: string };

    useUserStore.getState().setJwt(token);
    this.setAuthCookie(true);
  }

  /** user.store の JWT / walletAddress / balance / activeSessionId をクリア */
  signOut(): void {
    useUserStore.getState().signOut();
    this.setAuthCookie(false);
  }

  private setAuthCookie(authenticated: boolean): void {
    if (typeof document === 'undefined') return;
    if (authenticated) {
      document.cookie = 'nodestay-authed=1; path=/; max-age=86400; SameSite=Lax';
    } else {
      document.cookie = 'nodestay-authed=; path=/; max-age=0';
    }
  }

  /** 現在認証済みか（JWT があるか）を返す */
  isAuthenticated(): boolean {
    return useUserStore.getState().isAuthenticated ?? false;
  }
}

export const AuthService = new AuthServiceClass();
