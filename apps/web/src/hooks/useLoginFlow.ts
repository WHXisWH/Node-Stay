'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { useRouter } from 'next/navigation';
import { useUserStore } from '../models/stores/user.store';
import { useAuth } from './useAuth';
import { Web3AuthService } from '../services/web3auth.service';
import { CHAIN_CONFIG } from '../services/config';
import type { LoginMethod } from '../models/stores/user.store';

export interface UseLoginFlowParams {
  walletAddress: `0x${string}` | null;
  isAuthenticated: boolean;
  loginMethod: LoginMethod;
  onCloseModal: () => void;
}

export interface UseLoginFlowReturn {
  socialHint: string | null;
  pendingWalletSignIn: boolean;
  socialSigning: boolean;
  connecting: boolean;
  signing: boolean;
  authError: string | null;
  connectErrorMessage: string | null;
  walletActionLabel: string;
  clearMessages: () => void;
  handleWalletLogin: () => Promise<void>;
  handleSocialLogin: () => Promise<void>;
  handleLogout: () => Promise<void>;
}

/**
 * ログイン UI の制御をまとめる Hook。
 * ウォレット接続 + SIWE 認証 + ソーシャルログインを統合する。
 */
export function useLoginFlow(params: UseLoginFlowParams): UseLoginFlowReturn {
  const { walletAddress, isAuthenticated, loginMethod, onCloseModal } = params;
  const [socialHint, setSocialHint] = useState<string | null>(null);
  const [pendingWalletSignIn, setPendingWalletSignIn] = useState(false);
  const [socialSigning, setSocialSigning] = useState(false);
  const setWalletAddress = useUserStore((s) => s.setWalletAddress);
  const setLoginMethod = useUserStore((s) => s.setLoginMethod);
  const router = useRouter();

  const { address: wagmiAddress } = useAccount();
  const { connectors, connectAsync, isPending: connecting, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { signIn, signInWithCustomSigner, signOut, signing, authError } = useAuth(wagmiAddress ?? null);

  useEffect(() => {
    if (!isAuthenticated) return;

    onCloseModal();
    if (typeof window !== 'undefined') {
      const query = new URLSearchParams(window.location.search);
      const redirect = query.get('redirect');
      if (redirect && redirect.startsWith('/')) {
        router.replace(redirect);
      }
    }
  }, [isAuthenticated, onCloseModal, router]);

  useEffect(() => {
    if (!pendingWalletSignIn || !walletAddress) return;
    setPendingWalletSignIn(false);
    void signIn();
  }, [pendingWalletSignIn, walletAddress, signIn]);

  const clearMessages = useCallback(() => {
    setSocialHint(null);
  }, []);

  const handleWalletLogin = useCallback(async () => {
    if (isAuthenticated) {
      onCloseModal();
      return;
    }

    if (wagmiAddress) {
      setLoginMethod('wallet');
      await signIn();
      return;
    }

    const connector = connectors.find((c) => c.id === 'injected') ?? connectors[0];
    if (!connector) return;

    setPendingWalletSignIn(true);
    setLoginMethod('wallet');
    try {
      await connectAsync({ connector });
    } catch {
      setPendingWalletSignIn(false);
      setLoginMethod(null);
    }
  }, [connectAsync, connectors, isAuthenticated, onCloseModal, setLoginMethod, signIn, wagmiAddress]);

  const handleSocialLogin = useCallback(async () => {
    setSocialHint(null);
    setSocialSigning(true);
    try {
      const social = await Web3AuthService.connectSocial();
      setWalletAddress(social.address);
      setLoginMethod('social');
      await signInWithCustomSigner({
        walletAddress: social.address,
        chainId: CHAIN_CONFIG.id,
        signMessage: social.signMessage,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'ソーシャルログインに失敗しました。';
      setSocialHint(message);
      setLoginMethod(null);
    } finally {
      setSocialSigning(false);
    }
  }, [setWalletAddress, setLoginMethod, signInWithCustomSigner]);

  const handleLogout = useCallback(async () => {
    signOut();
    disconnect();
    await Web3AuthService.logout().catch(() => {});
    setSocialHint(null);
    onCloseModal();
  }, [disconnect, onCloseModal, signOut]);

  const walletActionLabel = useMemo(() => {
    if (connecting || pendingWalletSignIn) return 'ウォレット接続中...';
    if (signing) return '署名中...';
    if (isAuthenticated && loginMethod === 'social') return 'ソーシャル認証済み';
    if (isAuthenticated && loginMethod === 'wallet') return 'ウォレット認証済み';
    if (isAuthenticated) return '認証済み';
    if (!walletAddress) return 'ウォレットを接続してログイン';
    return 'ウォレット署名でログイン';
  }, [connecting, isAuthenticated, loginMethod, pendingWalletSignIn, signing, walletAddress]);

  return {
    socialHint,
    pendingWalletSignIn,
    socialSigning,
    connecting,
    signing,
    authError,
    connectErrorMessage: connectError?.message ?? null,
    walletActionLabel,
    clearMessages,
    handleWalletLogin,
    handleSocialLogin,
    handleLogout,
  };
}
