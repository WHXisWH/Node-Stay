'use client';

/**
 * usePassesPage: マイ利用権 Controller（SPEC §8）。
 * 利用権一覧・フィルター・QR モーダル状態を保持；View は表示とクリックで Hook の handler を呼ぶ。
 * 実データは API（/v1/usage-rights）から取得し、mock データは使用しない。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createNodeStayClient } from '../services/nodestay';
import { useUserStore } from '../stores/user.store';

export type UsageRightStatus = 'ACTIVE' | 'IN_USE' | 'CONSUMED' | 'EXPIRED' | 'TRANSFERRED' | 'PENDING';

export interface UsageRight {
  usageRightId: string;
  planName: string;
  venueName: string;
  status: UsageRightStatus;
  remainingMinutes: number;
  expiresAt: string;
  depositAmountMinor: number;
  depositStatus: 'NONE' | 'HELD' | 'PARTIALLY_CAPTURED' | 'RELEASED';
  transferable: boolean;
}

export type UsageRightFilterKey = 'all' | 'active' | 'history';

export interface UsePassesPageReturn {
  filtered: UsageRight[];
  activeFilter: UsageRightFilterKey;
  setActiveFilter: (k: UsageRightFilterKey) => void;
  activeCount: number;
  loading: boolean;
  qrRight: UsageRight | null;
  setQrRight: (r: UsageRight | null) => void;
}

// API レスポンスの status 文字列を UsageRightStatus に正規化する
function toUsageRightStatus(s: string): UsageRightStatus {
  const valid: UsageRightStatus[] = ['ACTIVE', 'IN_USE', 'CONSUMED', 'EXPIRED', 'TRANSFERRED', 'PENDING'];
  return valid.includes(s as UsageRightStatus) ? (s as UsageRightStatus) : 'EXPIRED';
}

export function usePassesPage(): UsePassesPageReturn {
  const walletAddress = useUserStore((s) => s.walletAddress);

  const [usageRights, setUsageRights] = useState<UsageRight[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeFilter, setActiveFilter] = useState<UsageRightFilterKey>('active');
  const [qrRight, setQrRight] = useState<UsageRight | null>(null);

  // API から利用権一覧を取得する
  const loadUsageRights = useCallback(async () => {
    if (!walletAddress) {
      // 未ログイン時は空配列を返す
      setUsageRights([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const client = createNodeStayClient();
      // ownerUserId として walletAddress を使用する（API 側で解決）
      const apiRights = await client.listUsageRights({ ownerUserId: walletAddress });

      const mapped: UsageRight[] = apiRights.map((r) => ({
        usageRightId: r.id,
        planName: r.usageProduct.name,
        venueName: r.usageProduct.venue.name,
        status: toUsageRightStatus(r.status),
        // API から remainingMinutes が返らない場合は durationMinutes を使用する
        remainingMinutes: r.usageProduct.durationMinutes,
        // expiresAt が API から返らない場合は空文字で代替する
        expiresAt: '',
        depositAmountMinor: r.usageProduct.priceMinor,
        depositStatus: 'NONE',
        transferable: false,
      }));

      setUsageRights(mapped);
    } catch {
      // API エラー時は空配列を返し、再試行はユーザー操作に委ねる
      setUsageRights([]);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    void loadUsageRights();
  }, [loadUsageRights]);

  // フィルター適用
  const filtered = useMemo(() => {
    return usageRights.filter((r) => {
      if (activeFilter === 'all') return true;
      if (activeFilter === 'active') return r.status === 'ACTIVE' || r.status === 'IN_USE';
      return r.status === 'CONSUMED' || r.status === 'EXPIRED' || r.status === 'TRANSFERRED';
    });
  }, [usageRights, activeFilter]);

  // アクティブな利用権数
  const activeCount = useMemo(
    () => usageRights.filter((r) => r.status === 'ACTIVE' || r.status === 'IN_USE').length,
    [usageRights],
  );

  return {
    filtered,
    activeFilter,
    setActiveFilter,
    activeCount,
    loading,
    qrRight,
    setQrRight,
  };
}
