/**
 * Pass store.
 * 購入 / 利用権一覧・詳細は UsageRightService が更新し、Controller は読み取り専用で扱う（SPEC §9）。
 */

import { create } from 'zustand';
import type { PurchasePassResult, UsageRight, UsageRightDetail } from '../pass.model';

export interface PassState {
  passes: PurchasePassResult[];
  lastPurchase: PurchasePassResult | null;
  loading: boolean;
  purchaseLoading: boolean;
  error: string | null;
  /** 利用権一覧（UsageRightService が更新） */
  usageRights: UsageRight[];
  usageRightsLoading: boolean;
  usageRightsError: string | null;
  /** 利用権詳細（UsageRightService が更新） */
  usageRightDetail: UsageRightDetail | null;
  usageRightDetailNotFound: boolean;
  usageRightDetailLoading: boolean;
}

export interface PassActions {
  setPasses: (passes: PurchasePassResult[]) => void;
  setLastPurchase: (result: PurchasePassResult | null) => void;
  setLoading: (loading: boolean) => void;
  setPurchaseLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  setUsageRights: (usageRights: UsageRight[]) => void;
  setUsageRightsLoading: (loading: boolean) => void;
  setUsageRightsError: (error: string | null) => void;
  setUsageRightDetail: (detail: UsageRightDetail | null) => void;
  setUsageRightDetailNotFound: (value: boolean) => void;
  setUsageRightDetailLoading: (loading: boolean) => void;
}

const initialState: PassState = {
  passes: [],
  lastPurchase: null,
  loading: false,
  purchaseLoading: false,
  error: null,
  usageRights: [],
  usageRightsLoading: false,
  usageRightsError: null,
  usageRightDetail: null,
  usageRightDetailNotFound: false,
  usageRightDetailLoading: false,
};

export const usePassStore = create<PassState & PassActions>((set) => ({
  ...initialState,
  setPasses: (passes) => set({ passes, error: null }),
  setLastPurchase: (lastPurchase) => set({ lastPurchase, error: null }),
  setLoading: (loading) => set({ loading }),
  setPurchaseLoading: (purchaseLoading) => set({ purchaseLoading }),
  setError: (error) => set({ error, loading: false, purchaseLoading: false }),
  clearError: () => set({ error: null }),
  setUsageRights: (usageRights) => set({ usageRights, usageRightsError: null }),
  setUsageRightsLoading: (usageRightsLoading) => set({ usageRightsLoading }),
  setUsageRightsError: (usageRightsError) => set({ usageRightsError, usageRightsLoading: false }),
  setUsageRightDetail: (usageRightDetail) => set({ usageRightDetail, usageRightDetailNotFound: false }),
  setUsageRightDetailNotFound: (usageRightDetailNotFound) => set({ usageRightDetailNotFound }),
  setUsageRightDetailLoading: (usageRightDetailLoading) => set({ usageRightDetailLoading }),
}));
