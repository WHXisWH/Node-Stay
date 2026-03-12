/**
 * マーケットプレイスストア
 * MarketplaceService が書き込み、Controller は読み取り専用（SPEC §9）
 */

import { create } from 'zustand';
import type { MarketplaceListing } from '../marketplace.model';

export interface MarketplaceState {
  listings: MarketplaceListing[];
  loading: boolean;
  error: string | null;
}

export interface MarketplaceActions {
  setListings: (listings: MarketplaceListing[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

const initialState: MarketplaceState = {
  listings: [],
  loading: false,
  error: null,
};

export const useMarketplaceStore = create<MarketplaceState & MarketplaceActions>((set) => ({
  ...initialState,
  setListings: (listings) => set({ listings, error: null }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
}));
