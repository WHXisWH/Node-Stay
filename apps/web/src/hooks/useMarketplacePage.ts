'use client';

/**
 * useMarketplacePage: 二次市場ブラウズ Controller（SPEC §8）。
 * 出品一覧を API から取得し、フィルター・購入フローを保持；View は表示のみ。
 * 購入処理は useMarketplaceWrite の buyListing を通じてコントラクトを直接呼び出す。
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createNodeStayClient } from '../services/nodestay';
import { useMarketplaceWrite } from './useMarketplaceWrite';

export type ListingType = 'USAGE' | 'COMPUTE' | 'REVENUE';
export type ListingStatus = 'ACTIVE' | 'SOLD' | 'CANCELLED' | 'EXPIRED';

export interface MarketplaceListing {
  listingId: string;
  listingType: ListingType;
  // 利用権情報
  planName: string;
  venueName: string;
  venueAddress: string;
  durationMinutes: number;
  remainingMinutes: number;
  expiresAt: string;
  transferable: boolean;
  // 出品情報
  sellerAddress: string;
  priceMinor: number;
  originalPriceMinor: number;
  status: ListingStatus;
  listedAt: string;
  onchainTokenId: string | null;
}

export type MarketplaceSort = 'price_asc' | 'price_desc' | 'expiry_asc' | 'newest';
export type DurationFilter = 'all' | 'short' | 'medium' | 'long';

export interface UseMarketplacePageReturn {
  listings: MarketplaceListing[];
  filtered: MarketplaceListing[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  sortBy: MarketplaceSort;
  setSortBy: (s: MarketplaceSort) => void;
  durationFilter: DurationFilter;
  setDurationFilter: (d: DurationFilter) => void;
  // 購入フロー
  buyingListing: MarketplaceListing | null;
  setBuyingListing: (l: MarketplaceListing | null) => void;
  purchasing: boolean;
  purchaseSuccess: boolean;
  purchaseError: string | null;
  handlePurchase: () => Promise<void>;
  /** API 取得中フラグ */
  loading: boolean;
  /** API エラーメッセージ */
  error: string | null;
}

export function useMarketplacePage(): UseMarketplacePageReturn {
  // 出品一覧の状態
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // フィルター・ソートの状態
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<MarketplaceSort>('newest');
  const [durationFilter, setDurationFilter] = useState<DurationFilter>('all');

  // 購入フローの状態
  const [buyingListing, setBuyingListing] = useState<MarketplaceListing | null>(null);
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  // on-chain 購入操作（JPYC approve → buyListing）
  const { buyListing, pending: purchasing, error: writeError } = useMarketplaceWrite();

  /** API からマーケットプレイス出品一覧を取得し Listing 型にマッピング */
  const loadListings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = createNodeStayClient();
      const data = await client.listMarketplaceListings();
      // API レスポンスを MarketplaceListing 型にマッピング
      const mapped: MarketplaceListing[] = data.map((item) => ({
        listingId: item.id,
        listingType: 'USAGE' as ListingType,
        planName: item.usageRight?.usageProduct?.productName ?? '利用権',
        // API に venueName フィールドがないためフォールバック
        venueName: '',
        venueAddress: '',
        durationMinutes: item.usageRight?.usageProduct?.durationMinutes ?? 0,
        remainingMinutes: item.usageRight?.usageProduct?.durationMinutes ?? 0,
        expiresAt: item.expiryAt ?? item.createdAt,
        transferable: true,
        sellerAddress: item.sellerUserId,
        // priceJpyc は JPYC 単位のため minor 変換（× 100）
        priceMinor: Math.round(parseFloat(item.priceJpyc) * 100),
        originalPriceMinor: Math.round(parseFloat(item.priceJpyc) * 100),
        status: item.status as ListingStatus,
        listedAt: item.createdAt,
        onchainTokenId: item.onchainListingId,
      }));
      setListings(mapped);
    } catch (err) {
      // エラー時は空配列を維持しエラーメッセージを保存
      setError(err instanceof Error ? err.message : '出品一覧の取得に失敗しました');
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // マウント時に出品一覧を取得
  useEffect(() => {
    void loadListings();
  }, [loadListings]);

  /** フィルター・ソートを適用した出品一覧 */
  const filtered = useMemo(() => {
    // アクティブな出品のみ表示
    let result = listings.filter((l) => l.status === 'ACTIVE');

    // テキスト検索
    const q = searchQuery.toLowerCase();
    if (q) {
      result = result.filter(
        (l) =>
          l.planName.toLowerCase().includes(q) ||
          l.venueName.toLowerCase().includes(q) ||
          l.venueAddress.toLowerCase().includes(q),
      );
    }

    // 利用時間フィルター
    if (durationFilter === 'short') result = result.filter((l) => l.durationMinutes <= 180);
    else if (durationFilter === 'medium') result = result.filter((l) => l.durationMinutes > 180 && l.durationMinutes <= 360);
    else if (durationFilter === 'long') result = result.filter((l) => l.durationMinutes > 360);

    // ソート
    return [...result].sort((a, b) => {
      if (sortBy === 'price_asc')  return a.priceMinor - b.priceMinor;
      if (sortBy === 'price_desc') return b.priceMinor - a.priceMinor;
      if (sortBy === 'expiry_asc') return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
      // newest
      return new Date(b.listedAt).getTime() - new Date(a.listedAt).getTime();
    });
  }, [listings, searchQuery, sortBy, durationFilter]);

  /** 購入処理：on-chain フロー（JPYC approve → buyListing）を実行 */
  const handlePurchase = async () => {
    if (!buyingListing) return;
    setPurchaseError(null);
    setPurchaseSuccess(false);

    // onchainListingId を優先使用し、なければ listingId にフォールバック
    const listingId = buyingListing.onchainTokenId ?? buyingListing.listingId;
    const priceMinor = String(buyingListing.priceMinor);

    const txHash = await buyListing(listingId, priceMinor);
    if (txHash) {
      // トランザクション送信成功
      setPurchaseSuccess(true);
      setBuyingListing(null);
    } else {
      // writeError は非同期状態のため汎用メッセージを表示
      if (writeError) {
        setPurchaseError(writeError);
      }
      // ユーザー拒否の場合は何もしない（useMarketplaceWrite 内でフィルタ済み）
    }
  };

  return {
    listings,
    filtered,
    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    durationFilter,
    setDurationFilter,
    buyingListing,
    setBuyingListing,
    purchasing,
    purchaseSuccess,
    purchaseError,
    handlePurchase,
    loading,
    error,
  };
}
