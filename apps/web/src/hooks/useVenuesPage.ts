/**
 * useVenuesPage: 店舗一覧 Controller（SPEC §8）。
 * venue.store を読み取り専用で扱い、VenueService を呼び出す。
 * View は本 Hook の戻り値のみを表示する。
 */

import { useEffect, useMemo, useState } from 'react';
import { useVenueStore } from '../stores/venue.store';
import { VenueService } from '../services/venue.service';
import type { VenueSortBy } from '../stores/venue.store';
import type { VenueListItem } from '../models/venue.model';

export interface UseVenuesPageReturn {
  filtered: VenueListItem[];
  loading: boolean;
  error: boolean;
  query: string;
  setQuery: (v: string) => void;
  sortBy: VenueSortBy;
  setSortBy: (v: VenueSortBy) => void;
  refresh: () => void;
}

export function useVenuesPage(): UseVenuesPageReturn {
  const { venues, loading, error } = useVenueStore();
  const [query, setQueryState] = useState('');
  const [sortBy, setSortByState] = useState<VenueSortBy>('name');

  useEffect(() => {
    VenueService.listVenues();
  }, []);

  const filtered = useMemo(() => {
    let list = [...venues];
    if (query) {
      const q = query.toLowerCase();
      list = list.filter(
        (v) =>
          v.name.toLowerCase().includes(q) ||
          v.address.toLowerCase().includes(q)
      );
    }
    if (sortBy === 'name') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }
    return list;
  }, [venues, query, sortBy]);

  const refresh = () => VenueService.listVenues();

  return {
    filtered,
    loading,
    error: !!error,
    query,
    setQuery: setQueryState,
    sortBy,
    setSortBy: setSortByState,
    refresh,
  };
}
