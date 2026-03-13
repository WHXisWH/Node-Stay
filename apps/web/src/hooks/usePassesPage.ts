'use client';

/**
 * usePassesPage: マイ利用権 Controller。
 * 読み取り専用 pass.store（usageRights）、呼び出し UsageRightService。市場出品は useMarketplaceWrite + MarketplaceService。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUserStore } from '../stores/user.store';
import { usePassStore } from '../stores/pass.store';
import { UsageRightService } from '../services/usageRight.service';
import { MarketplaceService } from '../services/marketplace.service';
import { useMarketplaceWrite } from './useMarketplaceWrite';
import type { UsageRight, UsageRightStatus } from '../models/pass.model';

export type { UsageRight, UsageRightStatus };
export type UsageRightFilterKey = 'all' | 'active' | 'history';

export interface UsePassesPageReturn {
  filtered: UsageRight[];
  activeFilter: UsageRightFilterKey;
  setActiveFilter: (k: UsageRightFilterKey) => void;
  activeCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  qrRight: UsageRight | null;
  setQrRight: (r: UsageRight | null) => void;
  listingRight: UsageRight | null;
  setListingRight: (r: UsageRight | null) => void;
  listPriceMinor: string;
  setListPriceMinor: (s: string) => void;
  handleConfirmListToMarket: () => Promise<void>;
  listingPending: boolean;
  listingError: string | null;
  cancelListingRight: UsageRight | null;
  setCancelListingRight: (r: UsageRight | null) => void;
  handleConfirmCancelListing: () => Promise<void>;
  cancelListingPending: boolean;
  cancelListingError: string | null;
}

export function usePassesPage(): UsePassesPageReturn {
  const walletAddress = useUserStore((s) => s.walletAddress);
  const { usageRights, usageRightsLoading, usageRightsError } = usePassStore();
  const {
    listUsageRight,
    cancelListing: chainCancelListing,
    pending: listPending,
    error: listError,
  } = useMarketplaceWrite();

  const [activeFilter, setActiveFilter] = useState<UsageRightFilterKey>('active');
  const [qrRight, setQrRight] = useState<UsageRight | null>(null);
  const [listingRight, setListingRight] = useState<UsageRight | null>(null);
  const [listPriceMinor, setListPriceMinor] = useState('');
  const [cancelListingRight, setCancelListingRight] = useState<UsageRight | null>(null);
  const [cancelListingPending, setCancelListingPending] = useState(false);
  const [cancelListingError, setCancelListingError] = useState<string | null>(null);

  const loadUsageRights = useCallback(() => UsageRightService.loadList(walletAddress ?? null), [walletAddress]);
  const refresh = useCallback(async () => {
    await loadUsageRights();
  }, [loadUsageRights]);

  useEffect(() => {
    void loadUsageRights();
  }, [loadUsageRights]);

  const handleConfirmListToMarket = useCallback(async () => {
    if (!listingRight?.onchainTokenId || !listPriceMinor.trim() || !walletAddress) return;
    const price = listPriceMinor.trim();
    const txHash = await listUsageRight(listingRight.onchainTokenId, price);
    if (txHash) {
      try {
        await MarketplaceService.createListing({
          usageRightId: listingRight.usageRightId,
          sellerUserId: walletAddress,
          priceJpyc: price,
          onchainTxHash: txHash,
          idempotencyKey: crypto.randomUUID(),
        });
        setListingRight(null);
        setListPriceMinor('');
        await loadUsageRights();
      } catch (e) {
        // オンチェーン成功だが API 失敗はコンソールに記録
        console.error('createListing API failed', e);
      }
    }
  }, [listingRight, listPriceMinor, walletAddress, listUsageRight, loadUsageRights]);

  const handleConfirmCancelListing = useCallback(async () => {
    if (!cancelListingRight?.listingId || !cancelListingRight?.onchainListingId || !walletAddress) return;
    setCancelListingPending(true);
    setCancelListingError(null);
    try {
      const txHash = await chainCancelListing(cancelListingRight.onchainListingId);
      if (txHash) {
        await MarketplaceService.cancelListing(
          cancelListingRight.listingId,
          walletAddress,
          txHash,
        );
        setCancelListingRight(null);
        await loadUsageRights();
      }
    } catch (e) {
      setCancelListingError(e instanceof Error ? e.message : 'キャンセルに失敗しました');
    } finally {
      setCancelListingPending(false);
    }
  }, [cancelListingRight, walletAddress, chainCancelListing, loadUsageRights]);

  const filtered = useMemo(() => {
    return usageRights.filter((r) => {
      if (activeFilter === 'all') return true;
      if (activeFilter === 'active')
        return r.status === 'ACTIVE' || r.status === 'IN_USE' || r.status === 'LISTED';
      return r.status === 'CONSUMED' || r.status === 'EXPIRED' || r.status === 'TRANSFERRED';
    });
  }, [usageRights, activeFilter]);

  const activeCount = useMemo(
    () =>
      usageRights.filter(
        (r) => r.status === 'ACTIVE' || r.status === 'IN_USE' || r.status === 'LISTED',
      ).length,
    [usageRights],
  );

  return {
    filtered,
    activeFilter,
    setActiveFilter,
    activeCount,
    loading: usageRightsLoading,
    error: usageRightsError,
    refresh,
    qrRight,
    setQrRight,
    listingRight,
    setListingRight,
    listPriceMinor,
    setListPriceMinor,
    handleConfirmListToMarket,
    listingPending: listPending,
    listingError: listError,
    cancelListingRight,
    setCancelListingRight,
    handleConfirmCancelListing,
    cancelListingPending,
    cancelListingError,
  };
}
