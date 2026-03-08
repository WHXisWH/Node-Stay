'use client';

// 店舗一覧ページ（View 層：useVenuesPage の戻り値を表示のみ、SPEC V1）

import Link from 'next/link';
import { useVenuesPage } from '../../hooks';
import type { VenueListItem } from '../../models/venue.model';

function SearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </div>
      <input
        type="text"
        placeholder="エリア・店舗名・住所で検索..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-field pl-11"
      />
    </div>
  );
}

function VenueCard({ venue }: { venue: VenueListItem }) {
  const amenities = ['ブース席', 'VIP席', 'フラット席', 'ドリンクバー'];
  return (
    <Link href={`/venues/${venue.venueId}`} className="card p-5 flex flex-col gap-4 group">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
            <h3 className="text-base font-bold text-slate-900 truncate group-hover:text-brand-600 transition-colors">
              {venue.name}
            </h3>
          </div>
          <p className="text-sm text-slate-500 flex items-center gap-1">
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span className="truncate">{venue.address}</span>
          </p>
        </div>
        <span className="badge-green flex-shrink-0">空席あり</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {amenities.slice(0, 3).map((a) => (
          <span key={a} className="badge-gray">{a}</span>
        ))}
        {amenities.length > 3 && <span className="badge-gray">+{amenities.length - 3}</span>}
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-slate-50">
        <div>
          <span className="text-xs text-slate-400">最安プラン</span>
          <div className="text-sm font-bold text-slate-800 mt-0.5">
            <span className="text-jpyc-600">500 JPYC〜</span>
            <span className="text-slate-400 font-normal text-xs ml-1">/ 3時間</span>
          </div>
        </div>
        <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center text-brand-500 group-hover:bg-brand-100 transition-colors">
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </div>
      </div>
    </Link>
  );
}

function VenueCardSkeleton() {
  return (
    <div className="card p-5 flex flex-col gap-4">
      <div className="skeleton h-5 w-3/4 rounded-lg" />
      <div className="skeleton h-4 w-1/2 rounded-lg" />
      <div className="flex gap-2">
        <div className="skeleton h-5 w-16 rounded-full" />
        <div className="skeleton h-5 w-16 rounded-full" />
        <div className="skeleton h-5 w-16 rounded-full" />
      </div>
      <div className="skeleton h-px w-full" />
      <div className="flex justify-between">
        <div className="skeleton h-8 w-24 rounded-lg" />
        <div className="skeleton h-8 w-8 rounded-lg" />
      </div>
    </div>
  );
}

function EmptyState({ query }: { query: string }) {
  return (
    <div className="col-span-full text-center py-20">
      <div className="text-5xl mb-4">🔍</div>
      <h3 className="text-lg font-bold text-slate-700 mb-2">
        {query ? `「${query}」に一致する店舗が見つかりません` : '店舗が見つかりません'}
      </h3>
      <p className="text-slate-400 text-sm">検索条件を変えてお試しください</p>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="col-span-full text-center py-20">
      <div className="text-5xl mb-4">⚠️</div>
      <h3 className="text-lg font-bold text-slate-700 mb-2">店舗データの取得に失敗しました</h3>
      <p className="text-slate-400 text-sm mb-6">ネットワーク接続を確認の上、再試行してください</p>
      <button onClick={onRetry} className="btn-primary">再試行</button>
    </div>
  );
}

export default function VenuesPage() {
  const { filtered, loading, error, query, setQuery, sortBy, setSortBy, refresh } = useVenuesPage();

  return (
    <>
      <div className="bg-surface-900 pt-24 pb-10">
        <div className="container-main">
          <nav className="flex items-center gap-2 text-sm text-slate-500 mb-6">
            <Link href="/" className="hover:text-slate-300 transition-colors">ホーム</Link>
            <span>/</span>
            <span className="text-slate-300">店舗を探す</span>
          </nav>
          <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-3">店舗を探す</h1>
          <p className="text-slate-400">全国のネットカフェをJPYCで予約・チェックイン</p>
        </div>
      </div>

      <div className="container-main py-8">
        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          <div className="flex-1">
            <SearchBar value={query} onChange={setQuery} />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'name' | 'price')}
            className="select-field sm:w-44"
          >
            <option value="name">名前順</option>
            <option value="price">価格順</option>
          </select>
        </div>

        {!loading && !error && (
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-500">
              <span className="font-semibold text-slate-800">{filtered.length}件</span>の店舗
              {query && <span>「{query}」の検索結果</span>}
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => <VenueCardSkeleton key={i} />)
          ) : error ? (
            <ErrorState onRetry={refresh} />
          ) : filtered.length === 0 ? (
            <EmptyState query={query} />
          ) : (
            filtered.map((venue) => <VenueCard key={venue.venueId} venue={venue} />)
          )}
        </div>
      </div>
    </>
  );
}
