/**
 * Pass store.
 * 購入状態は PassService が反映する。
 * Controller は読み取り専用で扱い、purchase を呼び出す（SPEC §9、TODO M15）。
 */

import { create } from 'zustand';
import type { PurchasePassResult } from '../pass.model';

export interface PassState {
  passes: PurchasePassResult[];
  lastPurchase: PurchasePassResult | null;
  loading: boolean;
  purchaseLoading: boolean;
  error: string | null;
}

export interface PassActions {
  setPasses: (passes: PurchasePassResult[]) => void;
  setLastPurchase: (result: PurchasePassResult | null) => void;
  setLoading: (loading: boolean) => void;
  setPurchaseLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

const initialState: PassState = {
  passes: [],
  lastPurchase: null,
  loading: false,
  purchaseLoading: false,
  error: null,
};

export const usePassStore = create<PassState & PassActions>((set) => ({
  ...initialState,
  setPasses: (passes) => set({ passes, error: null }),
  setLastPurchase: (lastPurchase) => set({ lastPurchase, error: null }),
  setLoading: (loading) => set({ loading }),
  setPurchaseLoading: (purchaseLoading) => set({ purchaseLoading }),
  setError: (error) => set({ error, loading: false, purchaseLoading: false }),
  clearError: () => set({ error: null }),
}));
