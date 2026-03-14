'use client';

import { useEffect, useMemo } from 'react';
import { useUserStore } from '../models/stores/user.store';
import { useWalletSync } from './useWalletSync';
import { UserService } from '../services/user.service';
import type { LoginMethod } from '../models/stores/user.store';

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export interface UseUserStateReturn {
  balance: number | null;
  /** SIWE 認証済みアドレス（トランザクション送信用） */
  walletAddress: `0x${string}` | null;
  /** wagmi 注入ウォレットのアドレス（未接続時は null） */
  connectedWalletAddress: `0x${string}` | null;
  /** SNS / Web3Auth の Owner EOA アドレス（未ログイン時は null） */
  socialWalletAddress: `0x${string}` | null;
  /** SNS ログイン時の AA スマートアカウントアドレス（未初期化時は null） */
  aaWalletAddress: `0x${string}` | null;
  /** 実際のオンチェーン送信に利用する主アドレス */
  onchainWalletAddress: `0x${string}` | null;
  /**
   * UI 表示用アドレス。
   * ソーシャルログイン時 → aaWalletAddress 優先（未初期化時は socialWalletAddress）。
   * ウォレットログイン時 → connectedWalletAddress。
   */
  displayAddress: `0x${string}` | null;
  isAuthenticated: boolean;
  loginMethod: LoginMethod;
  /** UI 表示用の短縮アドレス（または「未接続」） */
  walletLabel: string;
  /** アドレス種別のラベル（「スマートウォレット」or「ウォレット」） */
  addressTypeLabel: string;
}

/**
 * ユーザー状態を UI 用に整形して返す Hook。
 * ウォレット同期と残高取得を自動で実行する。
 */
export function useUserState(): UseUserStateReturn {
  const balance               = useUserStore((s) => s.balance?.balanceMinor ?? null);
  const walletAddress         = useUserStore((s) => s.walletAddress);
  const connectedWalletAddress = useUserStore((s) => s.connectedWalletAddress);
  const socialWalletAddress   = useUserStore((s) => s.socialWalletAddress);
  const aaWalletAddress       = useUserStore((s) => s.aaWalletAddress);
  const jwt                   = useUserStore((s) => s.jwt);
  const isAuthenticated       = useUserStore((s) => s.isAuthenticated);
  const loginMethod           = useUserStore((s) => s.loginMethod);
  const setBalance            = useUserStore((s) => s.setBalance);

  useWalletSync();

  const balanceWalletAddress: `0x${string}` | null = useMemo(() => {
    // SNS ログイン時は残高表示を AA ウォレットに統一する。
    if (loginMethod === 'social') return aaWalletAddress ?? null;
    if (loginMethod === 'wallet') return walletAddress ?? connectedWalletAddress;
    return walletAddress ?? connectedWalletAddress ?? null;
  }, [aaWalletAddress, connectedWalletAddress, loginMethod, walletAddress]);

  useEffect(() => {
    if (!isAuthenticated || !jwt) return;
    if (!balanceWalletAddress) {
      setBalance(null);
      return;
    }
    let cancelled = false;

    const sleep = (ms: number) => new Promise<void>((resolve) => {
      globalThis.setTimeout(resolve, ms);
    });

    const loadBalanceWithRetry = async () => {
      const retryWaitMs = [0, 1200, 2500];
      for (const waitMs of retryWaitMs) {
        if (cancelled) return;
        if (waitMs > 0) await sleep(waitMs);
        if (cancelled) return;
        try {
          await UserService.getBalance(undefined, balanceWalletAddress);
          return;
        } catch {
          // 次のリトライへ
        }
      }
    };

    void loadBalanceWithRetry();
    return () => {
      cancelled = true;
    };
  }, [balanceWalletAddress, isAuthenticated, jwt, setBalance]);

  // ログイン方法に応じて表示用アドレスを切り替える
  const displayAddress: `0x${string}` | null = useMemo(() => {
    if (loginMethod === 'social') return aaWalletAddress ?? socialWalletAddress;
    if (loginMethod === 'wallet') return connectedWalletAddress;
    return connectedWalletAddress ?? aaWalletAddress ?? socialWalletAddress ?? null;
  }, [aaWalletAddress, loginMethod, socialWalletAddress, connectedWalletAddress]);

  const onchainWalletAddress: `0x${string}` | null = useMemo(() => {
    if (loginMethod === 'social') return aaWalletAddress ?? socialWalletAddress ?? walletAddress;
    if (loginMethod === 'wallet') return walletAddress ?? connectedWalletAddress;
    return walletAddress ?? connectedWalletAddress ?? aaWalletAddress ?? socialWalletAddress ?? null;
  }, [aaWalletAddress, connectedWalletAddress, loginMethod, socialWalletAddress, walletAddress]);

  const walletLabel = useMemo(() => {
    if (!displayAddress) return '未接続';
    return shortAddress(displayAddress);
  }, [displayAddress]);

  const addressTypeLabel = loginMethod === 'social' ? 'AAウォレット' : 'ウォレット';

  return {
    balance,
    walletAddress,
    connectedWalletAddress,
    socialWalletAddress,
    aaWalletAddress,
    onchainWalletAddress,
    displayAddress,
    isAuthenticated,
    loginMethod,
    walletLabel,
    addressTypeLabel,
  };
}
