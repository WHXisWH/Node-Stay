'use client';

/**
 * useAuth — SIWE（Sign-In with Ethereum）Controller。
 * user store は読み取り中心で扱い、AuthService.signIn を呼び出す（直接 fetch / 直接 setJwt はしない）。
 */

import { useState, useCallback } from 'react';
import { useSignMessage, useChainId } from 'wagmi';
import { AuthService } from '../services/auth.service';

export interface UseAuthReturn {
  signIn: () => Promise<boolean>;
  signInWithCustomSigner: (params: {
    walletAddress: `0x${string}`;
    signMessage: (message: string) => Promise<string>;
    chainId?: number;
  }) => Promise<boolean>;
  signOut: () => void;
  signing: boolean;
  authError: string | null;
}

export function useAuth(walletAddress: `0x${string}` | null): UseAuthReturn {
  const walletChainId = useChainId();
  const envChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? '');
  const chainId = Number.isInteger(envChainId) && envChainId > 0 ? envChainId : walletChainId;
  const { signMessageAsync } = useSignMessage();
  const [signing, setSigning] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const signIn = useCallback(async (): Promise<boolean> => {
    if (!walletAddress) return false;
    setSigning(true);
    setAuthError(null);
    try {
      await AuthService.signIn({
        walletAddress,
        chainId,
        signMessage: (message) => signMessageAsync({ message }),
      });
      return true;
    } catch (err: unknown) {
      const msg =
        err instanceof TypeError && err.message.includes('Failed to fetch')
          ? `API サーバーに接続できません。apps/api を起動してください。`
          : err instanceof Error
            ? err.message
            : '認証エラーが発生しました';
      if (!msg.includes('User rejected') && !msg.includes('user rejected')) {
        setAuthError(msg);
      }
      return false;
    } finally {
      setSigning(false);
    }
  }, [chainId, signMessageAsync, walletAddress]);

  const signInWithCustomSigner = useCallback(async (params: {
    walletAddress: `0x${string}`;
    signMessage: (message: string) => Promise<string>;
    chainId?: number;
  }): Promise<boolean> => {
    setSigning(true);
    setAuthError(null);
    try {
      await AuthService.signIn({
        walletAddress: params.walletAddress,
        chainId: params.chainId ?? chainId,
        signMessage: params.signMessage,
      });
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '認証エラーが発生しました';
      if (!msg.includes('User rejected') && !msg.includes('user rejected')) {
        setAuthError(msg);
      }
      return false;
    } finally {
      setSigning(false);
    }
  }, [chainId]);

  const signOut = useCallback(() => {
    AuthService.signOut();
  }, []);

  return { signIn, signInWithCustomSigner, signOut, signing, authError };
}
