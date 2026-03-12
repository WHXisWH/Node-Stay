'use client';

import { useEffect, useMemo } from 'react';
import { useUserStore } from '../models/stores/user.store';
import { useWalletSync } from './useWalletSync';
import { UserService } from '../services/user.service';

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export interface UseUserStateReturn {
  balance: number | null;
  walletAddress: `0x${string}` | null;
  isAuthenticated: boolean;
  walletLabel: string;
}

/**
 * ユーザー状態を提供するフック
 * ウォレット同期と残高取得を自動実行
 */
export function useUserState(): UseUserStateReturn {
  const balance = useUserStore((s) => s.balance?.balanceMinor ?? null);
  const walletAddress = useUserStore((s) => s.walletAddress);
  const isAuthenticated = useUserStore((s) => s.isAuthenticated);

  useWalletSync();

  // 認証時に残高を取得
  useEffect(() => {
    if (isAuthenticated) {
      UserService.getBalance().catch(() => {});
    }
  }, [isAuthenticated]);

  const walletLabel = useMemo(() => {
    if (!walletAddress) return '未接続';
    return shortAddress(walletAddress);
  }, [walletAddress]);

  return {
    balance,
    walletAddress,
    isAuthenticated,
    walletLabel,
  };
}
