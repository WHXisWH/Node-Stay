'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { usePathname, useRouter } from 'next/navigation';
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
  isAuthenticating: boolean;
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
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const setWalletAddress = useUserStore((s) => s.setWalletAddress);
  const setLoginMethod = useUserStore((s) => s.setLoginMethod);
  const router = useRouter();
  const pathname = usePathname();

  const { address: wagmiAddress } = useAccount();
  const { connectors, connectAsync, isPending: connecting, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { signIn, signInWithCustomSigner, signOut, signing, authError } = useAuth(wagmiAddress ?? null);

  useEffect(() => {
    if (!isAuthenticated) return;

    onCloseModal();
    router.refresh();
    if (typeof window !== 'undefined') {
      const query = new URLSearchParams(window.location.search);
      const redirect = query.get('redirect');
      if (redirect && redirect.startsWith('/')) {
        router.replace(redirect);
      }
    }
  }, [isAuthenticated, onCloseModal, router]);

  useEffect(() => {
    if (!pendingWalletSignIn || !wagmiAddress) return;

    let active = true;
    setPendingWalletSignIn(false);
    void (async () => {
      setIsAuthenticating(true);
      const ok = await signIn();
      if (!active) return;
      setIsAuthenticating(false);
      if (!ok) {
        setLoginMethod(null);
      }
    })();

    return () => {
      active = false;
    };
  }, [pendingWalletSignIn, setLoginMethod, signIn, wagmiAddress]);

  const isProtectedPath = useCallback((path: string) => {
    const prefixes = ['/usage-rights', '/sessions', '/revenue', '/merchant', '/passes'];
    return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  }, []);

  const clearMessages = useCallback(() => {
    setSocialHint(null);
  }, []);

  const handleWalletLogin = useCallback(async () => {
    setSocialHint(null);

    if (isAuthenticated) {
      onCloseModal();
      return;
    }

    if (wagmiAddress) {
      setLoginMethod('wallet');
      setIsAuthenticating(true);
      const ok = await signIn();
      setIsAuthenticating(false);
      if (!ok) {
        setLoginMethod(null);
      }
      return;
    }

    const connector = connectors.find((c) => c.id === 'injected') ?? connectors[0];
    if (!connector) {
      setSocialHint('利用可能なウォレットコネクタが見つかりません。');
      return;
    }

    setPendingWalletSignIn(true);
    setLoginMethod('wallet');
    try {
      await connectAsync({ connector });
    } catch (error: unknown) {
      setPendingWalletSignIn(false);
      setLoginMethod(null);
      const message = error instanceof Error ? error.message : 'ウォレット接続に失敗しました。';
      setSocialHint(message);
    }
  }, [connectAsync, connectors, isAuthenticated, onCloseModal, setLoginMethod, signIn, wagmiAddress]);

  const handleSocialLogin = useCallback(async () => {
    setSocialHint(null);
    setPendingWalletSignIn(false);
    setSocialSigning(true);
    try {
      const social = await Web3AuthService.connectSocial();
      setWalletAddress(social.address);
      setLoginMethod('social');
      setIsAuthenticating(true);
      const ok = await signInWithCustomSigner({
        walletAddress: social.address,
        chainId: CHAIN_CONFIG.id,
        signMessage: social.signMessage,
      });
      if (!ok) {
        setLoginMethod(null);
        setWalletAddress(wagmiAddress ?? walletAddress ?? null);
        setSocialHint('署名または認証に失敗しました。もう一度お試しください。');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'ソーシャルログインに失敗しました。';
      setSocialHint(message);
      setLoginMethod(null);
      setWalletAddress(wagmiAddress ?? walletAddress ?? null);
    } finally {
      setSocialSigning(false);
      setIsAuthenticating(false);
    }
  }, [setWalletAddress, setLoginMethod, signInWithCustomSigner, wagmiAddress, walletAddress]);

  const handleLogout = useCallback(async () => {
    signOut();
    disconnect();
    await Web3AuthService.logout().catch(() => {});
    setPendingWalletSignIn(false);
    setSocialSigning(false);
    setIsAuthenticating(false);
    setSocialHint(null);
    onCloseModal();
    if (isProtectedPath(pathname)) {
      router.replace('/');
      return;
    }
    router.refresh();
  }, [disconnect, isProtectedPath, onCloseModal, pathname, router, signOut]);

  const walletActionLabel = useMemo(() => {
    if (connecting || pendingWalletSignIn) return 'ウォレット接続中...';
    if (signing || isAuthenticating || socialSigning) return '認証中...';
    if (isAuthenticated && loginMethod === 'social') return 'ソーシャル認証済み';
    if (isAuthenticated && loginMethod === 'wallet') return 'ウォレット認証済み';
    if (isAuthenticated) return '認証済み';
    if (!wagmiAddress) return 'ウォレットを接続してログイン';
    return 'ウォレット署名でログイン';
  }, [connecting, isAuthenticated, isAuthenticating, loginMethod, pendingWalletSignIn, signing, socialSigning, wagmiAddress]);

  return {
    socialHint,
    pendingWalletSignIn,
    socialSigning,
    isAuthenticating,
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
