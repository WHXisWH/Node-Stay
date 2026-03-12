/**
 * 商家ストア
 * Service が書き込み、Controller は読み取り専用（SPEC §9）
 */

import { create } from 'zustand';
import type {
  ManagedNode,
  MerchantMachineDetail,
  MerchantMachineItem,
  MerchantRevenueMachineOption,
  MerchantRevenueProgramItem,
  MerchantSlotWindow,
  MerchantUsageProductItem,
  MerchantVenueItem,
} from '../merchant.model';

export interface MerchantState {
  venues: MerchantVenueItem[];
  machines: MerchantMachineItem[];
  usageProducts: MerchantUsageProductItem[];
  computeNodes: ManagedNode[];
  revenuePrograms: MerchantRevenueProgramItem[];
  revenueProgramsMachines: MerchantRevenueMachineOption[];
  machineDetail: MerchantMachineDetail | null;
  machineDetailNotFound: boolean;
  machineSlots: MerchantSlotWindow[];
  loading: boolean;
  machineDetailLoading: boolean;
  machineSlotsLoading: boolean;
  error: string | null;
}

export interface MerchantActions {
  setVenues: (venues: MerchantVenueItem[]) => void;
  setMachines: (machines: MerchantMachineItem[]) => void;
  setUsageProducts: (products: MerchantUsageProductItem[]) => void;
  setComputeNodes: (nodes: ManagedNode[]) => void;
  setRevenuePrograms: (programs: MerchantRevenueProgramItem[]) => void;
  setRevenueProgramsMachines: (machines: MerchantRevenueMachineOption[]) => void;
  setMachineDetail: (detail: MerchantMachineDetail | null) => void;
  setMachineDetailNotFound: (value: boolean) => void;
  setMachineSlots: (slots: MerchantSlotWindow[]) => void;
  setLoading: (loading: boolean) => void;
  setMachineDetailLoading: (loading: boolean) => void;
  setMachineSlotsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;
}

const initialState: MerchantState = {
  venues: [],
  machines: [],
  usageProducts: [],
  computeNodes: [],
  revenuePrograms: [],
  revenueProgramsMachines: [],
  machineDetail: null,
  machineDetailNotFound: false,
  machineSlots: [],
  loading: false,
  machineDetailLoading: false,
  machineSlotsLoading: false,
  error: null,
};

export const useMerchantStore = create<MerchantState & MerchantActions>((set) => ({
  ...initialState,
  setVenues: (venues) => set({ venues }),
  setMachines: (machines) => set({ machines }),
  setUsageProducts: (usageProducts) => set({ usageProducts }),
  setComputeNodes: (computeNodes) => set({ computeNodes }),
  setRevenuePrograms: (revenuePrograms) => set({ revenuePrograms }),
  setRevenueProgramsMachines: (revenueProgramsMachines) => set({ revenueProgramsMachines }),
  setMachineDetail: (machineDetail) => set({ machineDetail, machineDetailNotFound: false }),
  setMachineDetailNotFound: (machineDetailNotFound) => set({ machineDetailNotFound }),
  setMachineSlots: (machineSlots) => set({ machineSlots }),
  setLoading: (loading) => set({ loading }),
  setMachineDetailLoading: (machineDetailLoading) => set({ machineDetailLoading }),
  setMachineSlotsLoading: (machineSlotsLoading) => set({ machineSlotsLoading }),
  setError: (error) => set({ error, loading: false }),
  clearError: () => set({ error: null }),
}));

export const getMerchantStore = () => useMerchantStore.getState();
export const setMerchantStore = useMerchantStore.setState;
