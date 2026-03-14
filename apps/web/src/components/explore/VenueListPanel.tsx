'use client';

import Link from 'next/link';
import type { VenueListItem } from '../../models/venue.model';

interface VenueListPanelProps {
  venues: VenueListItem[];
  selectedVenueId: string | null;
  hoveredVenueId: string | null;
  onSelectVenue: (venueId: string) => void;
  onHoverVenue: (venueId: string | null) => void;
  loading: boolean;
}

function VenueCardSkeleton() {
  return (
    <div className="p-5 animate-pulse">
      <div className="skeleton h-4 w-2/3 rounded-lg mb-2.5" />
      <div className="skeleton h-3 w-full rounded-lg mb-3" />
      <div className="flex gap-1.5 mb-3">
        <div className="skeleton h-5 w-14 rounded-full" />
        <div className="skeleton h-5 w-12 rounded-full" />
        <div className="skeleton h-5 w-16 rounded-full" />
      </div>
      <div className="skeleton h-px w-full mb-3" />
      <div className="flex justify-between">
        <div className="skeleton h-5 w-20 rounded-lg" />
        <div className="skeleton h-5 w-5 rounded" />
      </div>
    </div>
  );
}

export function VenueListPanel({
  venues,
  selectedVenueId,
  hoveredVenueId,
  onSelectVenue,
  onHoverVenue,
  loading,
}: VenueListPanelProps) {
  if (loading) {
    return (
      <div className="divide-y divide-slate-100">
        {Array.from({ length: 5 }).map((_, i) => (
          <VenueCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (venues.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
        <div className="text-4xl mb-3">🔍</div>
        <h3 className="text-sm font-bold text-slate-700 mb-1">
          条件に一致する店舗が見つかりません
        </h3>
        <p className="text-xs text-slate-400">フィルタを変更してお試しください</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-100">
      {venues.map((venue) => {
        const isSelected = venue.venueId === selectedVenueId;
        const isHovered = venue.venueId === hoveredVenueId;
        const hasGpu = venue.amenities?.includes('GPU');

        return (
          <div
            key={venue.venueId}
            className={`p-5 cursor-pointer transition-all duration-150 group ${
              isSelected
                ? 'bg-brand-50/60 border-l-[3px] border-l-brand-500'
                : isHovered
                ? 'bg-surface-50'
                : 'hover:bg-surface-50/60 border-l-[3px] border-l-transparent'
            }`}
            onClick={() => onSelectVenue(venue.venueId)}
            onMouseEnter={() => onHoverVenue(venue.venueId)}
            onMouseLeave={() => onHoverVenue(null)}
          >
            {/* Name + GPU badge */}
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2 h-2 rounded-full shrink-0 ${
                (venue.availableSeats ?? 0) > 5 ? 'bg-emerald-400' : (venue.availableSeats ?? 0) > 0 ? 'bg-amber-400' : 'bg-red-400'
              }`} />
              <h3 className="text-sm font-bold text-slate-900 truncate group-hover:text-brand-600 transition-colors">
                {venue.name}
              </h3>
              {hasGpu && <span className="badge-yellow shrink-0 text-[10px] py-0">GPU</span>}
            </div>

            {/* Address */}
            <p className="text-xs text-slate-500 mb-2.5 flex items-center gap-1 ml-4">
              <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 text-slate-400">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <span className="truncate">{venue.address}</span>
            </p>

            {/* Tags */}
            {venue.amenities && venue.amenities.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3 ml-4">
                {venue.amenities.slice(0, 4).map((a) => (
                  <span key={a} className="badge-gray text-[10px] py-0">{a}</span>
                ))}
                {venue.amenities.length > 4 && (
                  <span className="badge-gray text-[10px] py-0">+{venue.amenities.length - 4}</span>
                )}
              </div>
            )}

            {/* Price + seats + arrow */}
            <div className="flex items-center justify-between ml-4 pt-2.5 border-t border-slate-100/80">
              <div className="flex items-center gap-3">
                {venue.cheapestPlanMinor != null && (
                  <span className="text-xs font-bold text-jpyc-600">
                    {venue.cheapestPlanMinor.toLocaleString('ja-JP')} JPYC〜
                  </span>
                )}
                {venue.availableSeats != null && venue.totalSeats != null && (
                  <span className="text-xs text-slate-400">
                    空席{venue.availableSeats}/{venue.totalSeats}
                  </span>
                )}
              </div>
              <Link
                href={`/venues/${venue.venueId}`}
                onClick={(e) => e.stopPropagation()}
                className="w-7 h-7 rounded-lg bg-brand-50 flex items-center justify-center text-brand-500 group-hover:bg-brand-100 transition-colors shrink-0"
              >
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}
