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
  walletAddress: `0x${string}` | null;
  isAuthenticated: boolean;
  loginMethod: LoginMethod;
  walletLabel: string;
}

/**
 * ユーザー状態を UI 用に整形して返す Hook。
 * ウォレット同期と残高取得を自動で実行する。
 */
export function useUserState(): UseUserStateReturn {
  const balance = useUserStore((s) => s.balance?.balanceMinor ?? null);
  const walletAddress = useUserStore((s) => s.walletAddress);
  const isAuthenticated = useUserStore((s) => s.isAuthenticated);
  const loginMethod = useUserStore((s) => s.loginMethod);

  useWalletSync();

  useEffect(() => {
    if (!isAuthenticated) return;
    UserService.getBalance().catch(() => {});
  }, [isAuthenticated]);

  const walletLabel = useMemo(() => {
    if (!walletAddress) return '未接続';
    return shortAddress(walletAddress);
  }, [walletAddress]);

  return {
    balance,
    walletAddress,
    isAuthenticated,
    loginMethod,
    walletLabel,
  };
}
