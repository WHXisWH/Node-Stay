/**
 * 収益ダッシュボードストア
 * Service が書き込み、Controller は読み取り専用（SPEC §9）
 */

import { create } from 'zustand';
import type {
  Allocation,
  ClaimLifecycleStatus,
  ClaimTarget,
  RevenueRight,
} from '../revenue.model';

export interface RevenueState {
  rights: RevenueRight[];
  allocations: Allocation[];
  claimTargets: Record<string, ClaimTarget>;
  claimStatuses: Record<string, ClaimLifecycleStatus>;
  claimTxHashes: Record<string, string | null>;
  claimErrors: Record<string, string | null>;
  loading: boolean;
  error: string | null;
  claimingId: string | null;
}

export interface RevenueActions {
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  setDashboardData: (
    rights: RevenueRight[],
    allocations: Allocation[],
    claimTargets: Record<string, ClaimTarget>
  ) => void;
  setClaimingId: (allocationId: string | null) => void;
  setClaimStatus: (allocationId: string, status: ClaimLifecycleStatus) => void;
  setClaimTxHash: (allocationId: string, txHash: string | null) => void;
  setClaimError: (allocationId: string, error: string | null) => void;
  reset: () => void;
}

const initialState: RevenueState = {
  rights: [],
  allocations: [],
  claimTargets: {},
  claimStatuses: {},
  claimTxHashes: {},
  claimErrors: {},
  loading: false,
  error: null,
  claimingId: null,
};

export const useRevenueStore = create<RevenueState & RevenueActions>((set) => ({
  ...initialState,
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error, loading: false }),
  clearError: () => set({ error: null }),
  setDashboardData: (rights, allocations, claimTargets) =>
    set((s) => {
      const nextStatuses: Record<string, ClaimLifecycleStatus> = {};
      const nextHashes: Record<string, string | null> = {};
      const nextErrors: Record<string, string | null> = {};

      for (const alloc of allocations) {
        if (alloc.claimed) {
          nextStatuses[alloc.allocationId] = 'finalized';
        } else if (s.claimStatuses[alloc.allocationId]) {
          nextStatuses[alloc.allocationId] = s.claimStatuses[alloc.allocationId];
        }

        if (Object.prototype.hasOwnProperty.call(s.claimTxHashes, alloc.allocationId)) {
          nextHashes[alloc.allocationId] = s.claimTxHashes[alloc.allocationId] ?? null;
        }
        if (Object.prototype.hasOwnProperty.call(s.claimErrors, alloc.allocationId)) {
          nextErrors[alloc.allocationId] = s.claimErrors[alloc.allocationId] ?? null;
        }
      }

      return {
        rights,
        allocations,
        claimTargets,
        claimStatuses: nextStatuses,
        claimTxHashes: nextHashes,
        claimErrors: nextErrors,
        loading: false,
        error: null,
      };
    }),
  setClaimingId: (claimingId) => set({ claimingId }),
  setClaimStatus: (allocationId, status) =>
    set((s) => ({
      claimStatuses: { ...s.claimStatuses, [allocationId]: status },
    })),
  setClaimTxHash: (allocationId, txHash) =>
    set((s) => ({
      claimTxHashes: { ...s.claimTxHashes, [allocationId]: txHash },
    })),
  setClaimError: (allocationId, error) =>
    set((s) => ({
      claimErrors: { ...s.claimErrors, [allocationId]: error },
    })),
  reset: () => set(initialState),
}));

export const getRevenueStore = () => useRevenueStore.getState();
export const setRevenueStore = useRevenueStore.setState;
