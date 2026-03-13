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
  /** SNS / Web3Auth スマートウォレットのアドレス（未ログイン時は null） */
  socialWalletAddress: `0x${string}` | null;
  /**
   * UI 表示用アドレス。
   * ソーシャルログイン時 → socialWalletAddress、ウォレットログイン時 → connectedWalletAddress。
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
  const jwt                   = useUserStore((s) => s.jwt);
  const isAuthenticated       = useUserStore((s) => s.isAuthenticated);
  const loginMethod           = useUserStore((s) => s.loginMethod);

  useWalletSync();

  useEffect(() => {
    if (!isAuthenticated || !jwt) return;
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
          await UserService.getBalance();
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
  }, [isAuthenticated, jwt]);

  // ログイン方法に応じて表示用アドレスを切り替える
  const displayAddress: `0x${string}` | null = useMemo(() => {
    if (loginMethod === 'social') return socialWalletAddress;
    if (loginMethod === 'wallet') return connectedWalletAddress;
    return connectedWalletAddress ?? socialWalletAddress ?? null;
  }, [loginMethod, socialWalletAddress, connectedWalletAddress]);

  const walletLabel = useMemo(() => {
    if (!displayAddress) return '未接続';
    return shortAddress(displayAddress);
  }, [displayAddress]);

  const addressTypeLabel = loginMethod === 'social' ? 'スマートウォレット' : 'ウォレット';

  return {
    balance,
    walletAddress,
    connectedWalletAddress,
    socialWalletAddress,
    displayAddress,
    isAuthenticated,
    loginMethod,
    walletLabel,
    addressTypeLabel,
  };
}
