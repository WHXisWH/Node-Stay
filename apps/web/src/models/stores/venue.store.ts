/**
 * Venue store.
 * VenueService が取得したデータを反映する。
 * Controller は読み取り専用で扱い、Service を呼び出す（SPEC §9、TODO M12）。
 */

import { create } from 'zustand';
import type { VenueListItem, PlanListItem } from '../venue.model';

export type VenueSortBy = 'name' | 'price';

export interface VenueState {
  venues: VenueListItem[];
  plansByVenueId: Record<string, PlanListItem[]>;
  query: string;
  sortBy: VenueSortBy;
  loading: boolean;
  error: string | null;
  currentVenue: VenueListItem | null;
  plans: PlanListItem[];
  plansLoading: boolean;
  plansError: string | null;
}

export interface VenueActions {
  setVenues: (venues: VenueListItem[]) => void;
  setPlans: (venueId: string, plans: PlanListItem[]) => void;
  setQuery: (query: string) => void;
  setSortBy: (sortBy: VenueSortBy) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setCurrentVenue: (venue: VenueListItem | null) => void;
  setPlansList: (plans: PlanListItem[]) => void;
  setPlansLoading: (loading: boolean) => void;
  setPlansError: (error: string | null) => void;
  clearError: () => void;
}

const initialState: VenueState = {
  venues: [],
  plansByVenueId: {},
  query: '',
  sortBy: 'name',
  loading: false,
  error: null,
  currentVenue: null,
  plans: [],
  plansLoading: false,
  plansError: null,
};

export const useVenueStore = create<VenueState & VenueActions>((set) => ({
  ...initialState,
  setVenues: (venues) => set({ venues, error: null }),
  setPlans: (venueId, plans) =>
    set((s) => ({ plansByVenueId: { ...s.plansByVenueId, [venueId]: plans }, plans })),
  setQuery: (query) => set({ query }),
  setSortBy: (sortBy) => set({ sortBy }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
  setCurrentVenue: (currentVenue) => set({ currentVenue }),
  setPlansList: (plans) => set({ plans, plansError: null }),
  setPlansLoading: (plansLoading) => set({ plansLoading }),
  setPlansError: (plansError) => set({ plansError, plansLoading: false }),
  clearError: () => set({ error: null }),
}));

export const getVenueStore = () => useVenueStore.getState();
export const setVenueStore = useVenueStore.setState;
