import Link from 'next/link';
import type { VenueListItem } from '../../models/venue.model';

interface VenueMarkerPopupProps {
  venue: VenueListItem;
}

export function VenueMarkerPopup({ venue }: VenueMarkerPopupProps) {
  const hasGpu = venue.amenities?.includes('GPU');
  const seatColor = (venue.availableSeats ?? 0) > 5
    ? 'bg-emerald-400'
    : (venue.availableSeats ?? 0) > 0
    ? 'bg-amber-400'
    : 'bg-red-400';

  return (
    <div className="min-w-[240px] max-w-[280px] font-sans p-0.5">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`w-2 h-2 rounded-full shrink-0 ${seatColor}`} />
          <h3 className="text-[13px] font-bold text-slate-900 leading-snug truncate">{venue.name}</h3>
        </div>
        {hasGpu && (
          <span className="shrink-0 px-2 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-700 rounded-full border border-amber-200">
            GPU
          </span>
        )}
      </div>

      {/* Address */}
      <p className="text-[11px] text-slate-500 mb-2.5 flex items-center gap-1">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 text-slate-400">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0Z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        {venue.address}
      </p>

      {/* Stats row */}
      <div className="flex items-center gap-2 mb-2.5 py-2 px-2.5 bg-slate-50 rounded-lg">
        {venue.cheapestPlanMinor != null && (
          <div className="flex items-baseline gap-0.5">
            <span className="text-xs font-bold text-jpyc-600">{venue.cheapestPlanMinor.toLocaleString('ja-JP')}</span>
            <span className="text-[10px] text-slate-400">JPYC〜</span>
          </div>
        )}
        {venue.cheapestPlanMinor != null && venue.availableSeats != null && (
          <span className="text-slate-200">|</span>
        )}
        {venue.availableSeats != null && venue.totalSeats != null && (
          <div className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${seatColor}`} />
            <span className="text-[11px] text-slate-600">
              空席 <span className="font-semibold">{venue.availableSeats}</span>/{venue.totalSeats}
            </span>
          </div>
        )}
        {venue.openHours && (
          <>
            <span className="text-slate-200">|</span>
            <span className="text-[10px] text-slate-500">{venue.openHours}</span>
          </>
        )}
      </div>

      {/* Amenity tags */}
      {venue.amenities && venue.amenities.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {venue.amenities.map((a) => (
            <span
              key={a}
              className="px-2 py-0.5 text-[10px] font-medium bg-slate-100 text-slate-600 rounded-full"
            >
              {a}
            </span>
          ))}
        </div>
      )}

      {/* CTA */}
      <Link
        href={`/venues/${venue.venueId}`}
        className="btn-primary w-full py-2 text-xs justify-center"
      >
        詳細を見る
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </Link>
    </div>
  );
}
