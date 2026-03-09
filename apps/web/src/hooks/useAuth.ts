'use client';

/**
 * useAuth — SIWE（Sign-In with Ethereum）認証フック
 *
 * フロー：
 *   1. GET /v1/auth/nonce?address=0x... → nonce 取得
 *   2. wagmi signMessage で SIWE メッセージに署名
 *   3. POST /v1/auth/verify → JWT 取得
 *   4. useUserStore に JWT を保存（LocalStorage 永続化）
 */

import { useState, useCallback } from 'react';
import { useSignMessage, useChainId } from 'wagmi';
import { useUserStore } from '../stores/user.store';
import { getApiBaseUrl } from '../services/config';

const API_BASE = getApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);

// ---------------------------------------------------------------------------
// SIWE メッセージ構築
// ---------------------------------------------------------------------------
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
    // EIP-4361 の定型文でないとバックエンド（siwe パーサ）が弾く
    `${domain} wants you to sign in with your Ethereum account:`,
    address,
    '',
    'NodeStay にサインインします。',
    '',
    `URI: ${uri}`,
    `Version: 1`,
    `Chain ID: ${chainId}`,
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Hook 本体
// ---------------------------------------------------------------------------

export interface UseAuthReturn {
  /** SIWE サインインを実行する */
  signIn: () => Promise<void>;
  /** 外部プロバイダの署名で SIWE サインインを実行する */
  signInWithCustomSigner: (params: {
    walletAddress: `0x${string}`;
    signMessage: (message: string) => Promise<string>;
    chainId?: number;
  }) => Promise<void>;
  /** サインアウト（JWT + ウォレット状態をリセット） */
  signOut: () => void;
  /** 認証処理中フラグ */
  signing: boolean;
  /** エラーメッセージ */
  authError: string | null;
}

export function useAuth(walletAddress: `0x${string}` | null): UseAuthReturn {
  const chainId = useChainId();
  const { signMessageAsync } = useSignMessage();
  const { setJwt, signOut: storeSignOut } = useUserStore();

  const [signing, setSigning]     = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const finishSignIn = useCallback(async (params: {
    walletAddress: `0x${string}`;
    chainId: number;
    signMessage: (message: string) => Promise<string>;
  }) => {
    const { walletAddress: address, chainId: targetChainId, signMessage } = params;
    try {
      // 1. nonce 取得
      const nonceRes = await fetch(`${API_BASE}/v1/auth/nonce?address=${address}`);
      if (!nonceRes.ok) throw new Error('nonce の取得に失敗しました');
      const { nonce } = (await nonceRes.json()) as { nonce: string };

      // 2. SIWE メッセージ構築 & 署名
      const domain = typeof window !== 'undefined' ? window.location.host : 'localhost:3000';
      const uri    = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
      const message = buildSiweMessage({ address, nonce, chainId: targetChainId, domain, uri });
      const signature = await signMessage(message);

      // 3. バックエンドで検証 → JWT 取得
      const verifyRes = await fetch(`${API_BASE}/v1/auth/verify`, {
        method:  'POST',
        headers: { 'content-type': 'application/json' },
        body:    JSON.stringify({ message, signature }),
      });
      if (!verifyRes.ok) {
        const err = (await verifyRes.json().catch(() => ({}))) as { message?: string };
        throw new Error(err.message ?? '認証に失敗しました');
      }
      const { token } = (await verifyRes.json()) as { token: string };

      // 4. JWT を Store に保存
      setJwt(token);
    } catch (err: unknown) {
      const msg =
        err instanceof TypeError && err.message.includes('Failed to fetch')
          ? `API サーバーに接続できません（${API_BASE}）。apps/api を起動してください。`
          : err instanceof Error
            ? err.message
            : '認証エラーが発生しました';
      // ユーザーが署名キャンセルした場合はエラーとして扱わない
      if (!msg.includes('User rejected') && !msg.includes('user rejected')) {
        setAuthError(msg);
      }
    }
  }, [setJwt]);

  const signIn = useCallback(async () => {
    if (!walletAddress) return;
    setSigning(true);
    setAuthError(null);

    try {
      await finishSignIn({
        walletAddress,
        chainId,
        signMessage: (message) => signMessageAsync({ message }),
      });
    } finally {
      setSigning(false);
    }
  }, [chainId, finishSignIn, signMessageAsync, walletAddress]);

  const signInWithCustomSigner = useCallback(async (params: {
    walletAddress: `0x${string}`;
    signMessage: (message: string) => Promise<string>;
    chainId?: number;
  }) => {
    setSigning(true);
    setAuthError(null);
    try {
      await finishSignIn({
        walletAddress: params.walletAddress,
        chainId: params.chainId ?? chainId,
        signMessage: params.signMessage,
      });
    } finally {
      setSigning(false);
    }
  }, [chainId, finishSignIn]);

  const signOut = useCallback(() => {
    storeSignOut();
  }, [storeSignOut]);

  return { signIn, signInWithCustomSigner, signOut, signing, authError };
}
