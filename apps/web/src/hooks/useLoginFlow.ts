'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { usePathname, useRouter } from 'next/navigation';
import { useUserStore } from '../models/stores/user.store';
import { useAuth } from './useAuth';
import { Web3AuthService } from '../services/web3auth.service';
import { CHAIN_CONFIG } from '../services/config';
import type { LoginMethod } from '../models/stores/user.store';

/**
 * ログインフローの状態機械ステップ。
 *   idle        — 待機中（初期値・エラー解除後）
 *   connecting  — ウォレット接続 or SNS OAuth 画面を起動中
 *   signing     — SIWE メッセージへの署名待ち
 *   verifying   — バックエンドへの署名検証リクエスト中
 *   error       — いずれかのステップで失敗（ボタン非 disabled 状態に戻す）
 */
export type LoginStep = 'idle' | 'connecting' | 'signing' | 'verifying' | 'error';

export interface UseLoginFlowParams {
  walletAddress: `0x${string}` | null;
  isAuthenticated: boolean;
  loginMethod: LoginMethod;
  onCloseModal: () => void;
}

export interface UseLoginFlowReturn {
  loginStep: LoginStep;
  socialHint: string | null;
  aaHint: string | null;
  authError: string | null;
  connectErrorMessage: string | null;
  /** ログイン操作中かどうか（ボタン disabled 判定用） */
  isLoading: boolean;
  /** Header 主ボタンの文案（3 状態: 未接続 / 接続済み未認証 / 認証済み） */
  walletActionLabel: string;
  clearMessages: () => void;
  ensureAaWallet: () => Promise<void>;
  aaResolving: boolean;
  handleWalletLogin: () => Promise<void>;
  handleSocialLogin: () => Promise<void>;
  handleLogout: () => Promise<void>;
}

/**
 * ログイン UI の制御をまとめる Hook。
 * ウォレット接続 + SIWE 認証 + ソーシャルログインを統合し、
 * 有限状態機械で管理することで「ログイン中のまま固まる」状態残留を防ぐ。
 */
export function useLoginFlow(params: UseLoginFlowParams): UseLoginFlowReturn {
  const { walletAddress, isAuthenticated, loginMethod, onCloseModal } = params;

  // ログインフロー状態機械
  const [loginStep, setLoginStep] = useState<LoginStep>('idle');
  const [socialHint, setSocialHint] = useState<string | null>(null);
  const [aaHint, setAaHint] = useState<string | null>(null);
  const [aaResolving, setAaResolving] = useState(false);

  const setSocialWalletAddress = useUserStore((s) => s.setSocialWalletAddress);
  const setAaWalletAddress = useUserStore((s) => s.setAaWalletAddress);
  const aaWalletAddress = useUserStore((s) => s.aaWalletAddress);
  const setLoginMethod          = useUserStore((s) => s.setLoginMethod);
  const router = useRouter();
  const pathname = usePathname();

  const { address: wagmiAddress } = useAccount();
  const { connectors, connectAsync, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { signIn, signInWithCustomSigner, signOut, authError } = useAuth(wagmiAddress ?? null);

  const sleep = useCallback(
    (ms: number) => new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, ms);
    }),
    [],
  );

  /**
   * AA アドレス導出は初回接続直後に失敗する場合があるため、
   * 短いリトライで安定化させる。
   */
  const resolveAaWalletAddressWithRetry = useCallback(async (
    options?: { attempts?: number; baseIntervalMs?: number },
  ): Promise<`0x${string}` | null> => {
    const attempts = options?.attempts ?? 3;
    const baseIntervalMs = options?.baseIntervalMs ?? 700;
    let lastError: unknown = null;

    for (let i = 0; i < attempts; i += 1) {
      try {
        const aaAddress = await Web3AuthService.resolveAaWalletAddress();
        if (aaAddress) {
          setAaWalletAddress(aaAddress);
          return aaAddress;
        }
      } catch (error) {
        lastError = error;
      }

      if (i < attempts - 1) {
        await sleep(baseIntervalMs * (i + 1));
      }
    }

    if (lastError) {
      throw (lastError instanceof Error ? lastError : new Error(String(lastError)));
    }
    return null;
  }, [setAaWalletAddress, sleep]);

  /**
   * ソーシャル認証済み状態でページ再読み込みされた場合、
   * 揮発メモリに残らない provider / アドレスを静かに復元する。
   */
  useEffect(() => {
    if (!isAuthenticated || loginMethod !== 'social') return;

    let active = true;
    void (async () => {
      try {
        const restored = await Web3AuthService.restoreSocialSession();
        if (!active || !restored?.address) return;
        setSocialWalletAddress(restored.address);
        if (aaWalletAddress) return;
        await resolveAaWalletAddressWithRetry({ attempts: 4, baseIntervalMs: 900 });
      } catch {
        // 復元失敗時は未処理。購入時に getOrRestoreProvider が再試行し、
        // それでも不可なら「再ログインしてください」を返す。
      }
    })();

    return () => { active = false; };
  }, [
    aaWalletAddress,
    isAuthenticated,
    loginMethod,
    resolveAaWalletAddressWithRetry,
    setSocialWalletAddress,
  ]);

  /** 認証完了時: モーダルを閉じてリダイレクト処理 */
  useEffect(() => {
    if (!isAuthenticated) return;
    setLoginStep('idle');
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

  /**
   * ウォレット接続完了後（wagmiAddress が到着）に署名フェーズへ遷移する。
   * loginStep === 'connecting' && loginMethod === 'wallet' の場合のみ実行。
   */
  useEffect(() => {
    if (loginStep !== 'connecting' || loginMethod !== 'wallet' || !wagmiAddress) return;

    let active = true;
    void (async () => {
      setLoginStep('signing');
      const ok = await signIn();
      if (!active) return;
      if (ok) {
        // isAuthenticated が true になったタイミングで上の useEffect が後始末する
        setLoginStep('verifying');
      } else {
        setLoginStep('error');
        setLoginMethod(null);
      }
    })();

    return () => { active = false; };
  }, [loginStep, loginMethod, wagmiAddress, signIn, setLoginMethod]);

  const isProtectedPath = useCallback((path: string) => {
    const prefixes = ['/usage-rights', '/sessions', '/revenue', '/merchant', '/passes'];
    return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  }, []);

  /** エラーメッセージとヒントをリセットし、状態を idle に戻す */
  const clearMessages = useCallback(() => {
    setSocialHint(null);
    setAaHint(null);
    setLoginStep((prev) => (prev === 'error' ? 'idle' : prev));
  }, []);

  const ensureAaWallet = useCallback(async () => {
    if (loginMethod !== 'social' || !isAuthenticated) {
      setAaHint('ソーシャルログイン後に AA ウォレットを初期化できます。');
      return;
    }
    setAaHint(null);
    setAaResolving(true);
    try {
      const aaAddress = await resolveAaWalletAddressWithRetry({ attempts: 4, baseIntervalMs: 900 });
      if (!aaAddress) {
        setAaHint('AA ウォレットの初期化に失敗しました。再ログインしてください。');
        return;
      }
      setAaHint('AA ウォレットを更新しました。');
    } catch (error: unknown) {
      setAaHint(error instanceof Error ? error.message : 'AA ウォレットの初期化に失敗しました。');
    } finally {
      setAaResolving(false);
    }
  }, [isAuthenticated, loginMethod, resolveAaWalletAddressWithRetry]);

  /** ウォレットログイン（MetaMask 等の注入ウォレット） */
  const handleWalletLogin = useCallback(async () => {
    setSocialHint(null);
    setAaHint(null);
    if (isAuthenticated) { onCloseModal(); return; }

    if (wagmiAddress) {
      // ウォレット接続済み → 署名フェーズへ直接進む
      setLoginMethod('wallet');
      setLoginStep('signing');
      const ok = await signIn();
      if (!ok) {
        setLoginStep('error');
        setLoginMethod(null);
      }
      return;
    }

    // ウォレット未接続 → 接続フェーズへ（useEffect がアドレス到着を検知して署名へ進む）
    const connector = connectors.find((c) => c.id === 'injected') ?? connectors[0];
    if (!connector) {
      setSocialHint('利用可能なウォレットコネクタが見つかりません。');
      setLoginStep('error');
      return;
    }

    setLoginMethod('wallet');
    setLoginStep('connecting');
    try {
      await connectAsync({ connector });
    } catch (error: unknown) {
      setLoginStep('error');
      setLoginMethod(null);
      setSocialHint(error instanceof Error ? error.message : 'ウォレット接続に失敗しました。');
    }
  }, [connectAsync, connectors, isAuthenticated, onCloseModal, setLoginMethod, signIn, wagmiAddress]);

  /** ソーシャルログイン（Google / X / Email → Web3Auth → SIWE） */
  const handleSocialLogin = useCallback(async () => {
    setSocialHint(null);
    setAaHint(null);
    setLoginStep('connecting');
    try {
      // SNS OAuth + Web3Auth でスマートウォレットを取得
      const social = await Web3AuthService.connectSocial();
      setSocialWalletAddress(social.address);
      setLoginMethod('social');

      // SIWE 署名フェーズ
      setLoginStep('signing');
      const ok = await signInWithCustomSigner({
        walletAddress: social.address,
        chainId: CHAIN_CONFIG.id,
        signMessage: social.signMessage,
      });

      if (!ok) {
        // 失敗時はソーシャルウォレット情報をクリアして error へ
        setLoginStep('error');
        setSocialWalletAddress(null);
        setAaWalletAddress(null);
        setLoginMethod(null);
        setSocialHint('署名または認証に失敗しました。もう一度お試しください。');
      } else {
        await resolveAaWalletAddressWithRetry({ attempts: 4, baseIntervalMs: 900 }).catch(() => null);
      }
      // 成功時は isAuthenticated が true になったタイミングの useEffect が処理する
    } catch (err: unknown) {
      setLoginStep('error');
      setSocialWalletAddress(null);
      setAaWalletAddress(null);
      setLoginMethod(null);
      setSocialHint(err instanceof Error ? err.message : 'ソーシャルログインに失敗しました。');
    }
  }, [resolveAaWalletAddressWithRetry, setAaWalletAddress, setSocialWalletAddress, setLoginMethod, signInWithCustomSigner]);

  /** ログアウト */
  const handleLogout = useCallback(async () => {
    signOut();
    disconnect();
    await Web3AuthService.logout().catch(() => {});
    setLoginStep('idle');
    setSocialHint(null);
    setAaHint(null);
    onCloseModal();
    if (isProtectedPath(pathname)) {
      router.replace('/');
      return;
    }
    router.refresh();
  }, [disconnect, isProtectedPath, onCloseModal, pathname, router, signOut]);

  const isLoading = loginStep !== 'idle' && loginStep !== 'error';

  /**
   * ウォレットログインボタンの文案。
   * 3 状態: 未接続 → 接続済み未認証 → 認証済み
   */
  const walletActionLabel = useMemo(() => {
    if (isLoading) {
      if (loginStep === 'connecting') return 'ウォレット接続中...';
      if (loginStep === 'signing')   return '署名確認中...';
      if (loginStep === 'verifying') return '認証中...';
    }
    if (isAuthenticated && loginMethod === 'social') return 'ソーシャル認証済み';
    if (isAuthenticated && loginMethod === 'wallet') return 'ウォレット認証済み';
    if (isAuthenticated)  return '認証済み';
    if (wagmiAddress)     return '署名してログイン';
    return 'ウォレットを接続してログイン';
  }, [isLoading, loginStep, isAuthenticated, loginMethod, wagmiAddress]);

  return {
    loginStep,
    socialHint,
    aaHint,
    authError,
    connectErrorMessage: connectError?.message ?? null,
    isLoading,
    walletActionLabel,
    clearMessages,
    ensureAaWallet,
    aaResolving,
    handleWalletLogin,
    handleSocialLogin,
    handleLogout,
  };
}
