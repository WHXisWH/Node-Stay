'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useState } from 'react';
import { useExplorePage } from '../../hooks/useExplorePage';
import { ExploreFilters } from '../../components/explore/ExploreFilters';
import { VenueListPanel } from '../../components/explore/VenueListPanel';
import type { VenueListItem } from '../../models/venue.model';

const VenueMap = dynamic(() => import('../../components/explore/VenueMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-surface-900 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 animate-fade-in">
        <div className="w-12 h-12 rounded-xl bg-surface-800 flex items-center justify-center border border-slate-700">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" className="animate-pulse-slow">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
        </div>
        <span className="text-sm font-medium text-slate-400">地図を読み込み中...</span>
      </div>
    </div>
  ),
});

export default function ExplorePage() {
  const {
    filteredVenues,
    loading,
    error,
    amenityFilter,
    allAmenities,
    toggleAmenity,
    searchQuery,
    setSearchQuery,
    selectedVenueId,
    selectVenue,
    hoveredVenueId,
    hoverVenue,
    mapCenter,
    mapZoom,
    refresh,
  } = useExplorePage();

  const [panelOpen, setPanelOpen] = useState(true);

  return (
    <div className="flex flex-col h-screen">
      {/* Hero header */}
      <div className="bg-surface-900 pt-24 pb-5 shrink-0">
        <div className="container-main">
          <nav className="flex items-center gap-2 text-sm text-slate-500 mb-4">
            <Link href="/" className="hover:text-slate-300 transition-colors">ホーム</Link>
            <span>/</span>
            <span className="text-slate-300">マップで探す</span>
          </nav>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-white mb-1">マップで探す</h1>
              <p className="text-sm text-slate-400">渋谷エリアのネットカフェをマップから探す</p>
            </div>
            <Link
              href="/venues"
              className="hidden md:inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-slate-300 border border-slate-700 rounded-xl hover:bg-slate-800 hover:text-white transition-all"
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
              リスト表示
            </Link>
          </div>
        </div>
      </div>

      {/* Filters */}
      <ExploreFilters
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        amenityFilter={amenityFilter}
        allAmenities={allAmenities}
        onToggleAmenity={toggleAmenity}
        resultCount={filteredVenues.length}
      />

      {/* Error banner — error 和 loading 独立显示，防止闪烁 */}
      {(error || loading) && (
        <div className={`px-4 py-2.5 border-b flex items-center justify-between shrink-0 transition-colors ${
          error ? 'bg-red-50 border-red-100' : 'bg-blue-50 border-blue-100'
        }`}>
          {error ? (
            <>
              <span className="text-sm text-red-600 font-medium">
                データの取得に失敗しました：{error}
              </span>
              <button
                onClick={refresh}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1 text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-60 rounded-lg transition-colors"
              >
                {loading && (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                )}
                再試行
              </button>
            </>
          ) : (
            <>
              <span className="text-sm text-blue-600 font-medium flex items-center gap-2">
                <div className="w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                データを読み込み中...
              </span>
            </>
          )}
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-1 min-h-0 relative">
        {/* Desktop sidebar */}
        <div
          className={`hidden md:flex flex-col bg-white transition-all duration-300 ${
            panelOpen ? 'w-[380px] border-r border-slate-200' : 'w-0 overflow-hidden border-r-0'
          }`}
        >
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/50 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-brand-50 flex items-center justify-center">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#6366F1" strokeWidth="2" strokeLinecap="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </div>
              <h2 className="text-sm font-bold text-slate-800">店舗一覧</h2>
              <span className="badge-blue">{filteredVenues.length}件</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            <VenueListPanel
              venues={filteredVenues}
              selectedVenueId={selectedVenueId}
              hoveredVenueId={hoveredVenueId}
              onSelectVenue={selectVenue}
              onHoverVenue={hoverVenue}
              loading={loading}
            />
          </div>
        </div>

        {/* Toggle button (desktop) */}
        <button
          className="hidden md:flex absolute top-1/2 -translate-y-1/2 z-20 w-5 h-14 bg-white border border-slate-200 shadow-md items-center justify-center hover:bg-slate-50 transition-all"
          style={{
            left: panelOpen ? '380px' : '0px',
            borderRadius: panelOpen ? '0 8px 8px 0' : '0 8px 8px 0',
          }}
          onClick={() => setPanelOpen(!panelOpen)}
          aria-label={panelOpen ? 'パネルを閉じる' : 'パネルを開く'}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#64748B"
            strokeWidth="3"
            strokeLinecap="round"
            className={`transition-transform duration-300 ${panelOpen ? '' : 'rotate-180'}`}
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        {/* Map area */}
        <div className="flex-1 relative">
          <VenueMap
            venues={filteredVenues}
            center={mapCenter}
            zoom={mapZoom}
            selectedVenueId={selectedVenueId}
            hoveredVenueId={hoveredVenueId}
            onSelectVenue={selectVenue}
          />

          {/* Map overlay badge */}
          <div className="absolute top-3 right-3 z-20">
            <div className="flex items-center gap-4 px-4 py-2 bg-white/95 backdrop-blur-sm rounded-xl shadow-card border border-slate-100">
              <div className="flex items-center gap-1.5 text-xs">
                <span className="w-2.5 h-2.5 rounded-full bg-brand-500" />
                <span className="font-medium text-slate-600">ネットカフェ</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="w-2.5 h-2.5 rounded-full bg-jpyc-500" />
                <span className="font-medium text-slate-600">GPU搭載</span>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile bottom drawer */}
        <div className="md:hidden absolute bottom-0 left-0 right-0 z-20">
          <MobileDrawer
            venues={filteredVenues}
            selectedVenueId={selectedVenueId}
            hoveredVenueId={hoveredVenueId}
            onSelectVenue={selectVenue}
            onHoverVenue={hoverVenue}
            loading={loading}
          />
        </div>
      </div>
    </div>
  );
}

function MobileDrawer({
  venues,
  selectedVenueId,
  hoveredVenueId,
  onSelectVenue,
  onHoverVenue,
  loading,
}: {
  venues: VenueListItem[];
  selectedVenueId: string | null;
  hoveredVenueId: string | null;
  onSelectVenue: (id: string) => void;
  onHoverVenue: (id: string | null) => void;
  loading: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`bg-white rounded-t-2xl shadow-lg border-t border-slate-200 transition-all duration-300 ${
        expanded ? 'h-[55vh]' : 'h-[130px]'
      }`}
    >
      <button
        className="w-full flex justify-center py-2.5"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="w-10 h-1 bg-slate-300 rounded-full" />
      </button>

      <div className="flex items-center justify-between px-4 pb-2">
        <span className="text-sm font-bold text-slate-800">
          <span className="text-brand-600">{venues.length}</span> 件の店舗
        </span>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs font-semibold text-brand-600 hover:text-brand-700"
        >
          {expanded ? '閉じる' : 'すべて表示'}
        </button>
      </div>

      <div className="overflow-y-auto" style={{ height: expanded ? 'calc(55vh - 56px)' : '72px' }}>
        <VenueListPanel
          venues={venues}
          selectedVenueId={selectedVenueId}
          hoveredVenueId={hoveredVenueId}
          onSelectVenue={onSelectVenue}
          onHoverVenue={onHoverVenue}
          loading={loading}
        />
      </div>
    </div>
  );
}
