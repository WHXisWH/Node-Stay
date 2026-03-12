/**
 * AuthService: SIWE nonce + verify → 成功後に user.store へ JWT を保存
 * signOut / isAuthenticated を提供
 */

import { getApiBaseUrl } from './config';
import { useUserStore } from '../models/stores/user.store';
import { getAddress } from 'viem';

const API_BASE = getApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);
const NONCE_TIMEOUT_MS = 12000;
const SIGN_TIMEOUT_MS = 45000;
const VERIFY_TIMEOUT_MS = 15000;

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

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('サーバー応答がタイムアウトしました。時間をおいて再試行してください。');
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

async function withTimeout<T>(task: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = globalThis.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try {
    return await Promise.race([task, timeoutPromise]);
  } finally {
    if (timeoutId !== null) {
      globalThis.clearTimeout(timeoutId);
    }
  }
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

    const nonceRes = await fetchWithTimeout(
      `${API_BASE}/v1/auth/nonce?address=${address}`,
      {},
      NONCE_TIMEOUT_MS,
    );
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
    const signature = await withTimeout(
      signMessage(message),
      SIGN_TIMEOUT_MS,
      '署名確認がタイムアウトしました。ウォレット画面を確認して再試行してください。',
    );

    const verifyRes = await fetchWithTimeout(
      `${API_BASE}/v1/auth/verify`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, signature }),
      },
      VERIFY_TIMEOUT_MS,
    );
    if (!verifyRes.ok) {
      const err = (await verifyRes.json().catch(() => ({}))) as { message?: string };
      throw new Error(err.message ?? '認証に失敗しました');
    }
    const { token } = (await verifyRes.json()) as { token: string };

    useUserStore.getState().setWalletAddress(address);
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
