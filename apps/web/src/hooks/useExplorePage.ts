/**
 * useExplorePage: 地図探索ページ Controller（SPEC §8）。
 * venue.store を読み取り専用で扱い、VenueService を呼び出す。
 * View は本 Hook の返り値のみで表示する。
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import { useVenueStore } from '../stores/venue.store';
import { VenueService } from '../services/venue.service';
import type { VenueListItem } from '../models/venue.model';

const SHIBUYA_CENTER: [number, number] = [35.658, 139.7016];
const DEFAULT_ZOOM = 14;

const ALL_AMENITIES = ['Wi-Fi', 'GPU', '個室', '電源', 'ドリンクバー', 'シャワー', 'カフェ', 'コミック'] as const;

export interface UseExplorePageReturn {
  venues: VenueListItem[];
  filteredVenues: VenueListItem[];
  loading: boolean;
  error: string | null;
  amenityFilter: string[];
  allAmenities: readonly string[];
  toggleAmenity: (amenity: string) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedVenueId: string | null;
  selectVenue: (venueId: string | null) => void;
  hoveredVenueId: string | null;
  hoverVenue: (venueId: string | null) => void;
  mapCenter: [number, number];
  mapZoom: number;
  flyTo: (lat: number, lng: number) => void;
  refresh: () => void;
}

export function useExplorePage(): UseExplorePageReturn {
  const { venues, loading, error } = useVenueStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [amenityFilter, setAmenityFilter] = useState<string[]>([]);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [hoveredVenueId, setHoveredVenueId] = useState<string | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>(SHIBUYA_CENTER);
  const [mapZoom, setMapZoom] = useState(DEFAULT_ZOOM);

  useEffect(() => {
    VenueService.listVenues();
  }, []);

  const filteredVenues = useMemo(() => {
    let list = [...venues];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          v.address.toLowerCase().includes(q),
      );
    }

    if (amenityFilter.length > 0) {
      list = list.filter((v) =>
        amenityFilter.every((a) => v.amenities?.includes(a)),
      );
    }

    return list;
  }, [venues, searchQuery, amenityFilter]);

  const toggleAmenity = useCallback((amenity: string) => {
    setAmenityFilter((prev) =>
      prev.includes(amenity)
        ? prev.filter((a) => a !== amenity)
        : [...prev, amenity],
    );
  }, []);

  const selectVenue = useCallback((venueId: string | null) => {
    setSelectedVenueId(venueId);
    if (venueId) {
      const venue = venues.find((v) => v.venueId === venueId);
      if (venue) {
        setMapCenter([venue.latitude, venue.longitude]);
        setMapZoom(16);
      }
    }
  }, [venues]);

  const flyTo = useCallback((lat: number, lng: number) => {
    setMapCenter([lat, lng]);
    setMapZoom(16);
  }, []);

  const refresh = useCallback(() => {
    VenueService.listVenues();
  }, []);

  return {
    venues,
    filteredVenues,
    loading,
    error,
    amenityFilter,
    allAmenities: ALL_AMENITIES,
    toggleAmenity,
    searchQuery,
    setSearchQuery,
    selectedVenueId,
    selectVenue,
    hoveredVenueId,
    hoverVenue: setHoveredVenueId,
    mapCenter,
    mapZoom,
    flyTo,
    refresh,
  };
}
