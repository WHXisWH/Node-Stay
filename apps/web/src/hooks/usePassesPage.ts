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
import { useUserState } from './useUserState';
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
  latestTxHash: string | null;
  latestTxType: 'list' | 'cancel' | null;
  clearLatestTx: () => void;
}

function parseUsageListingError(error: unknown, action: 'list' | 'cancel'): string {
  const fallback = action === 'list'
    ? '出品トランザクションの送信に失敗しました。'
    : '出品取消トランザクションの送信に失敗しました。';
  const raw = error instanceof Error ? error.message : String(error ?? '');
  if (!raw) return fallback;
  if (/user rejected|rejected the request/i.test(raw)) return '署名がキャンセルされました。';
  if (/connector not connected/i.test(raw)) return 'ウォレット接続が切断されています。再ログインしてください。';
  if (raw.includes('0x59dc379f') || raw.includes('NotTokenOwner')) {
    return 'この利用権の所有者ではないため出品できません。';
  }
  if (raw.includes('0xa22b745e') || raw.includes('CooldownNotElapsed')) {
    return '購入直後の利用権は24時間経過するまで再出品できません。';
  }
  if (raw.includes('0x0f603df8') || raw.includes('TransferCutoffPassed')) {
    return '譲渡期限を過ぎているため出品できません。';
  }
  if (raw.includes('0xdf978235') || raw.includes('MaxTransferCountReached')) {
    return '譲渡回数の上限に達しているため出品できません。';
  }
  if (raw.includes('0x66cb03e9') || raw.includes('ListingNotActive')) {
    return 'この出品はすでに無効です。画面を更新してください。';
  }
  if (raw.includes('0x5ec82351') || raw.includes('NotSeller')) {
    return '出品者本人のみ取消できます。';
  }
  if (/UserOperation reverted during simulation/i.test(raw)) {
    return 'AA シミュレーションで拒否されました。所有者と譲渡条件を確認してください。';
  }
  return fallback;
}

export function usePassesPage(): UsePassesPageReturn {
  const walletAddress = useUserStore((s) => s.walletAddress);
  const { onchainWalletAddress } = useUserState();
  const { usageRights, usageRightsLoading, usageRightsError } = usePassStore();
  const {
    listUsageRight,
    cancelListing: chainCancelListing,
    pending: listPending,
    error: chainWriteError,
  } = useMarketplaceWrite();

  const [activeFilter, setActiveFilter] = useState<UsageRightFilterKey>('active');
  const [qrRight, setQrRight] = useState<UsageRight | null>(null);
  const [listingRight, setListingRight] = useState<UsageRight | null>(null);
  const [listPriceMinor, setListPriceMinor] = useState('');
  const [listingLocalError, setListingLocalError] = useState<string | null>(null);
  const [cancelListingRight, setCancelListingRight] = useState<UsageRight | null>(null);
  const [cancelListingPending, setCancelListingPending] = useState(false);
  const [cancelListingError, setCancelListingError] = useState<string | null>(null);
  const [latestTxHash, setLatestTxHash] = useState<string | null>(null);
  const [latestTxType, setLatestTxType] = useState<'list' | 'cancel' | null>(null);

  useEffect(() => {
    if (!listingRight) setListingLocalError(null);
  }, [listingRight]);

  useEffect(() => {
    if (!cancelListingRight) setCancelListingError(null);
  }, [cancelListingRight]);

  const loadUsageRights = useCallback(() => UsageRightService.loadList(walletAddress ?? null), [walletAddress]);
  const refresh = useCallback(async () => {
    await loadUsageRights();
  }, [loadUsageRights]);

  useEffect(() => {
    void loadUsageRights();
  }, [loadUsageRights]);

  const handleConfirmListToMarket = useCallback(async () => {
    setListingLocalError(null);
    if (!walletAddress) {
      setListingLocalError('ウォレット未接続のため出品できません');
      return;
    }
    if (!listingRight?.onchainTokenId) {
      setListingLocalError('オンチェーン tokenId がないため出品できません');
      return;
    }
    const price = listPriceMinor.trim();
    if (!/^\d+$/.test(price) || Number(price) <= 0) {
      setListingLocalError('出品価格は 1 以上の整数で入力してください');
      return;
    }

    const txHash = await listUsageRight(listingRight.onchainTokenId, price);
    if (!txHash) {
      setListingLocalError(parseUsageListingError(chainWriteError, 'list'));
      return;
    }

    try {
      await MarketplaceService.createListing({
        usageRightId: listingRight.usageRightId,
        sellerUserId: walletAddress,
        sellerWallet: onchainWalletAddress ?? undefined,
        priceJpyc: price,
        onchainTxHash: txHash,
        idempotencyKey: crypto.randomUUID(),
      });
      setListingRight(null);
      setListPriceMinor('');
      setLatestTxHash(txHash);
      setLatestTxType('list');
      await loadUsageRights();
    } catch (e) {
      setListingLocalError(
        'オンチェーン出品は成功しましたが、マーケット登録 API に失敗しました。再読み込みして状態を確認してください',
      );
      // オンチェーン成功後の API 不整合を調査できるように記録する。
      console.error('createListing API failed', e);
    }
  }, [listingRight, listPriceMinor, walletAddress, onchainWalletAddress, listUsageRight, loadUsageRights, chainWriteError]);

  const handleConfirmCancelListing = useCallback(async () => {
    if (!walletAddress) {
      setCancelListingError('ウォレット未接続のため出品取消できません');
      return;
    }
    if (!cancelListingRight?.listingId || !cancelListingRight?.onchainListingId) {
      setCancelListingError('出品情報が不足しているため取消できません');
      return;
    }
    setCancelListingPending(true);
    setCancelListingError(null);
    try {
      const txHash = await chainCancelListing(cancelListingRight.onchainListingId);
      if (!txHash) {
        setCancelListingError(parseUsageListingError(chainWriteError, 'cancel'));
        return;
      }
      await MarketplaceService.cancelListing(
        cancelListingRight.listingId,
        walletAddress,
        txHash,
        onchainWalletAddress ?? undefined,
      );
      setCancelListingRight(null);
      setLatestTxHash(txHash);
      setLatestTxType('cancel');
      await loadUsageRights();
    } catch (e) {
      setCancelListingError(parseUsageListingError(e, 'cancel'));
    } finally {
      setCancelListingPending(false);
    }
  }, [cancelListingRight, walletAddress, onchainWalletAddress, chainCancelListing, loadUsageRights, chainWriteError]);

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
    listingError: listingLocalError ?? chainWriteError,
    cancelListingRight,
    setCancelListingRight,
    handleConfirmCancelListing,
    cancelListingPending,
    cancelListingError,
    latestTxHash,
    latestTxType,
    clearLatestTx: () => {
      setLatestTxHash(null);
      setLatestTxType(null);
    },
  };
}
