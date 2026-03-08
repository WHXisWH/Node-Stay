'use client';

interface ExploreFiltersProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  amenityFilter: string[];
  allAmenities: readonly string[];
  onToggleAmenity: (amenity: string) => void;
  resultCount: number;
}

const AMENITY_LABELS: Record<string, { icon: string; label: string }> = {
  'Wi-Fi': { icon: '📶', label: 'Wi-Fi' },
  'GPU': { icon: '⚡', label: 'GPU対応' },
  '個室': { icon: '🔒', label: '個室' },
  '電源': { icon: '🔌', label: '電源完備' },
  'ドリンクバー': { icon: '🥤', label: 'ドリンク' },
  'シャワー': { icon: '🚿', label: 'シャワー' },
  'カフェ': { icon: '☕', label: 'カフェ' },
  'コミック': { icon: '📚', label: 'コミック' },
};

export function ExploreFilters({
  searchQuery,
  onSearchChange,
  amenityFilter,
  allAmenities,
  onToggleAmenity,
  resultCount,
}: ExploreFiltersProps) {
  return (
    <div className="bg-white border-b border-slate-200 shrink-0">
      <div className="container-main py-3">
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          {/* Search */}
          <div className="relative flex-1 w-full sm:max-w-sm">
            <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="エリア・店舗名で検索..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="input-field pl-10 py-2"
            />
          </div>

          {/* Amenity pills */}
          <div className="flex flex-wrap gap-1.5 flex-1">
            {allAmenities.map((amenity) => {
              const active = amenityFilter.includes(amenity);
              const info = AMENITY_LABELS[amenity] ?? { icon: '•', label: amenity };
              return (
                <button
                  key={amenity}
                  onClick={() => onToggleAmenity(amenity)}
                  className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-full border transition-all duration-150 ${
                    active
                      ? 'bg-brand-600 border-brand-600 text-white shadow-sm'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-brand-300 hover:text-brand-600'
                  }`}
                >
                  <span className={`text-xs ${active ? 'grayscale-0 brightness-200' : ''}`}>{info.icon}</span>
                  {info.label}
                </button>
              );
            })}
          </div>

          {/* Result count */}
          <span className="hidden sm:block text-xs font-medium text-slate-400 whitespace-nowrap">
            {resultCount}件
          </span>
        </div>
      </div>
    </div>
  );
}
