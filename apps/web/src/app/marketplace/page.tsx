'use client';

// マーケットプレイスページ（View 層：useMarketplacePage の戻り値を表示のみ）

import { useEffect } from 'react';
import Link from 'next/link';
import { useMarketplacePage } from '../../hooks';
import { Modal, useToast } from '../../components/ui';
import type { MarketplaceListing, MarketplaceSort, DurationFilter } from '../../hooks/useMarketplacePage';

// ===== ユーティリティ =====
function formatJPYC(minor: number) {
  return (minor / 100).toLocaleString('ja-JP');
}

function formatDuration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}時間${m}分` : `${h}時間`;
}

function formatRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}分前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}時間前`;
  return `${Math.floor(hours / 24)}日前`;
}

function formatExpiryDays(iso: string) {
  const days = Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return '本日期限';
  if (days === 1) return '明日期限';
  return `${days}日後期限`;
}

function discountPercent(original: number, price: number) {
  return Math.round(((original - price) / original) * 100);
}

// ===== 購入確認モーダル =====
function PurchaseModal({
  isOpen,
  listing,
  onConfirm,
  onClose,
  purchasing,
  error,
}: {
  isOpen: boolean;
  listing: MarketplaceListing | null;
  onConfirm: () => void;
  onClose: () => void;
  purchasing: boolean;
  error: string | null;
}) {
  if (!listing) return null;

  const discount = discountPercent(listing.originalPriceMinor, listing.priceMinor);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="購入確認"
      size="md"
      footer={
        <div className="flex gap-3 w-full">
          <button onClick={onClose} disabled={purchasing} className="btn-secondary flex-1 py-2.5">
            キャンセル
          </button>
          <button onClick={onConfirm} disabled={purchasing} className="btn-primary flex-1 py-2.5">
            {purchasing ? (
              <span className="flex items-center gap-2 justify-center">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                購入中...
              </span>
            ) : 'JPYC で購入する'}
          </button>
        </div>
      }
    >
      {/* 商品情報 */}
      <div className="bg-slate-50 rounded-xl p-4 mb-4 flex flex-col gap-2.5 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">プラン</span>
          <span className="font-semibold text-slate-800">{listing.planName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">店舗</span>
          <span className="font-semibold text-slate-800">{listing.venueName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">利用時間</span>
          <span className="font-semibold text-slate-800">{formatDuration(listing.durationMinutes)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">有効期限</span>
          <span className="font-semibold text-slate-800">{formatExpiryDays(listing.expiresAt)}</span>
        </div>
        <div className="border-t border-slate-200 pt-2.5 flex justify-between items-center">
          <span className="text-slate-500">出品者</span>
          <span className="font-mono text-xs text-slate-600">{listing.sellerAddress}</span>
        </div>
        <div className="bg-brand-50 rounded-lg p-3 flex justify-between items-center mt-1">
          <div>
            <p className="text-xs text-slate-400 line-through">{formatJPYC(listing.originalPriceMinor)} JPYC</p>
            <p className="text-xl font-extrabold text-brand-700">{formatJPYC(listing.priceMinor)} JPYC</p>
          </div>
          {discount > 0 && (
            <span className="text-sm font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
              {discount}% OFF
            </span>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-red-500 mb-4" role="alert">{error}</p>}

      <p className="text-xs text-slate-400 leading-relaxed">
        ※ 購入後、利用権はマイ利用権に追加されます。JPYC は即時決済されます。
        オンチェーン転送完了まで数秒かかる場合があります。
      </p>
    </Modal>
  );
}

// ===== 出品カードコンポーネント =====
function ListingCard({
  listing,
  onBuy,
}: {
  listing: MarketplaceListing;
  onBuy: (l: MarketplaceListing) => void;
}) {
  const discount = discountPercent(listing.originalPriceMinor, listing.priceMinor);
  const expiryDays = Math.ceil((new Date(listing.expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const isExpiringSoon = expiryDays <= 2;

  return (
    <div className="card p-5 flex flex-col gap-4 hover:shadow-card-hover transition-shadow duration-200">
      {/* ヘッダー */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {discount > 0 && (
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                {discount}% OFF
              </span>
            )}
            {isExpiringSoon && (
              <span className="text-xs font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
                まもなく期限
              </span>
            )}
          </div>
          <h3 className="text-base font-bold text-slate-900 truncate">{listing.planName}</h3>
          <p className="text-sm text-slate-500 truncate mt-0.5">{listing.venueName}</p>
        </div>
        {listing.onchainTokenId && (
          <span className="text-xs text-slate-400 font-mono flex-shrink-0">#{listing.onchainTokenId}</span>
        )}
      </div>

      {/* 詳細情報 */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-slate-500">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          {formatDuration(listing.durationMinutes)}
        </div>
        <div className={`flex items-center gap-1.5 ${isExpiringSoon ? 'text-red-500' : 'text-slate-500'}`}>
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          {formatExpiryDays(listing.expiresAt)}
        </div>
        <div className="flex items-center gap-1.5 text-slate-500">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
          </svg>
          {listing.sellerAddress}
        </div>
        <div className="flex items-center gap-1.5 text-slate-400">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
          </svg>
          {formatRelativeTime(listing.listedAt)}出品
        </div>
      </div>

      {/* 価格 */}
      <div className="flex items-end justify-between pt-1 border-t border-slate-50">
        <div>
          {discount > 0 && (
            <p className="text-xs text-slate-400 line-through">{formatJPYC(listing.originalPriceMinor)} JPYC</p>
          )}
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-extrabold text-slate-900">{formatJPYC(listing.priceMinor)}</span>
            <span className="text-sm font-semibold text-jpyc-500">JPYC</span>
          </div>
        </div>
        <button
          onClick={() => onBuy(listing)}
          className="btn-primary py-2 px-5 text-sm"
        >
          購入する
        </button>
      </div>
    </div>
  );
}

// ===== ページコンポーネント =====
export default function MarketplacePage() {
  const toast = useToast();
  const {
    filtered,
    searchQuery, setSearchQuery,
    sortBy, setSortBy,
    durationFilter, setDurationFilter,
    buyingListing, setBuyingListing,
    purchasing, purchaseSuccess, purchaseError,
    handlePurchase,
  } = useMarketplacePage();

  // 購入成功時の通知
  useEffect(() => {
    if (purchaseSuccess) {
      toast.success('利用権を購入しました。マイ利用権で確認できます。');
    }
  }, [purchaseSuccess, toast]);

  // 購入エラー時の通知
  useEffect(() => {
    if (purchaseError) {
      toast.error(purchaseError);
    }
  }, [purchaseError, toast]);

  const SORT_OPTIONS: { value: MarketplaceSort; label: string }[] = [
    { value: 'newest',     label: '新着順' },
    { value: 'price_asc',  label: '価格：安い順' },
    { value: 'price_desc', label: '価格：高い順' },
    { value: 'expiry_asc', label: '期限が近い順' },
  ];

  const DURATION_TABS: { key: DurationFilter; label: string }[] = [
    { key: 'all',    label: 'すべて' },
    { key: 'short',  label: '〜3時間' },
    { key: 'medium', label: '3〜6時間' },
    { key: 'long',   label: '6時間超' },
  ];

  return (
    <>
      {/* ページヘッダー */}
      <div className="bg-surface-900 pt-24 pb-10">
        <div className="container-main">
          <nav className="flex items-center gap-2 text-sm text-slate-500 mb-6">
            <Link href="/" className="hover:text-slate-300 transition-colors">ホーム</Link>
            <span>/</span>
            <span className="text-slate-300">マーケットプレイス</span>
          </nav>

          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-extrabold text-white mb-2">マーケットプレイス</h1>
              <p className="text-slate-400">
                他のユーザーが出品した利用権を購入できます —
                <span className="text-white ml-1">{filtered.length}件</span> 出品中
              </p>
            </div>
            <Link href="/usage-rights" className="btn-secondary py-2.5 text-sm">
              マイ利用権を出品する
            </Link>
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="container-main py-8">

        {/* 購入成功バナー */}
        {purchaseSuccess && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="2 6 5 10 11 3" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-emerald-800">購入が完了しました！</p>
            <Link href="/usage-rights" className="ml-auto btn-primary py-1.5 px-4 text-sm flex-shrink-0">
              マイ利用権を見る
            </Link>
          </div>
        )}

        {/* フィルター・検索 */}
        <div className="flex flex-col gap-4 mb-8">
          {/* 検索・ソート行 */}
          <div className="flex gap-3 flex-wrap">
            {/* 検索 */}
            <div className="flex-1 min-w-48 relative">
              <svg viewBox="0 0 24 24" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                placeholder="プラン名・店舗名で検索..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
              />
            </div>
            {/* ソート */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as MarketplaceSort)}
              className="px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* 利用時間フィルター */}
          <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
            {DURATION_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setDurationFilter(tab.key)}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all duration-150 ${
                  durationFilter === tab.key
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* 出品グリッド */}
        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">🏪</div>
            <h3 className="text-lg font-bold text-slate-700 mb-2">
              {searchQuery ? '検索条件に一致する出品がありません' : '現在出品中の利用権はありません'}
            </h3>
            <p className="text-slate-400 text-sm mb-6">
              {searchQuery ? '別のキーワードで検索してください' : '店舗で直接購入できます'}
            </p>
            <Link href="/venues" className="btn-primary">店舗を探す</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((listing) => (
              <ListingCard
                key={listing.listingId}
                listing={listing}
                onBuy={setBuyingListing}
              />
            ))}
          </div>
        )}

        {/* 説明セクション */}
        <div className="mt-12 card p-6 bg-slate-50">
          <h2 className="text-sm font-bold text-slate-700 mb-3">マーケットプレイスについて</h2>
          <ul className="flex flex-col gap-2">
            {[
              '利用権は元の価格より安く購入できる場合があります',
              '譲渡可能な利用権のみ出品できます（各利用権の設定による）',
              '購入後のキャンセルは原則不可です。有効期限をご確認ください',
              '取引はすべて Polygon PoS 上でオンチェーン記録されます',
            ].map((note) => (
              <li key={note} className="text-sm text-slate-500 flex items-start gap-2">
                <span className="text-slate-300 mt-0.5">•</span>
                {note}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* 購入確認モーダル */}
      <PurchaseModal
        isOpen={!!buyingListing}
        listing={buyingListing}
        onConfirm={handlePurchase}
        onClose={() => setBuyingListing(null)}
        purchasing={purchasing}
        error={purchaseError}
      />
    </>
  );
}
