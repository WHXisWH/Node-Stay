/**
 * Merchant (venue/plan/seat/dispute) input types.
 * Aligned with API contracts in apps/api.
 */

/** Input for POST /v1/merchant/venues */
export interface CreateVenueInput {
  name: string;
  address: string;
  timezone: string;
}

/** Input for PUT /v1/merchant/venues/:venueId/products */
export interface UpsertUsageProductInput {
  productName: string;
  usageType: 'HOURLY' | 'PACK' | 'NIGHT' | 'FLEX';
  durationMinutes: number;
  priceJpyc: string;
  transferable?: boolean;
  maxTransferCount?: number;
}

/** Seat type enum for API */
export type SeatType = 'OPEN' | 'BOOTH' | 'FLAT' | 'VIP';

/** Seat status enum for API */
export type SeatStatus = 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE' | 'COMPUTE_MODE';

/** Input for POST/PUT /v1/merchant/venues/:venueId/seats */
export interface SeatInput {
  seatId?: string;
  type: SeatType;
  status?: SeatStatus;
}

/** Input for POST /v1/merchant/venues/:venueId/compute/enable */
export interface EnableComputeInput {
  enable: boolean;
}

/** Input for POST /v1/merchant/disputes */
export interface DisputeInput {
  venueId: string;
  reason: string;
}

/** 店舗一覧要素（API listVenues と同型） */
export interface MerchantVenueItem {
  venueId: string;
  name: string;
  address: string;
  timezone: string;
}

/** マシン一覧要素（API listMachines + UI 用拡張） */
export type MerchantMachineStatus = 'REGISTERED' | 'ACTIVE' | 'PAUSED' | 'MAINTENANCE' | 'DECOMMISSIONED';
export type MerchantMachineClass = 'GPU' | 'CPU' | 'PREMIUM' | 'STANDARD';

export interface MerchantMachineItem {
  id: string;
  machineId: string;
  venueId: string;
  machineClass: MerchantMachineClass;
  label: string;
  cpu: string;
  gpu: string | null;
  ramGb: number;
  storageGb: number;
  status: MerchantMachineStatus;
  onchainTokenId: string | null;
  sessionsTotal: number;
  earningsTotalMinor: number;
}

/** 利用権商品一覧要素（API listUsageProducts + UI 用） */
export interface MerchantUsageProductItem {
  id: string;
  name: string;
  usageType: string;
  durationMinutes: number;
  priceMinor: number;
  depositRequiredMinor: number;
  transferable: boolean;
  maxTransferCount: number;
  status: 'ACTIVE' | 'PAUSED' | 'DRAFT';
  soldCount: number;
  venueId: string;
  machineId: string | null;
}

/** 収益プログラム一覧要素（API listRevenuePrograms） */
export interface MerchantRevenueProgramItem {
  id: string;
  machineId: string;
  shareBps: number;
  revenueScope: string;
  startAt: string;
  endAt: string;
  settlementCycle: string;
  status: string;
}

/** 収益プログラム用マシン選択肢 */
export interface MerchantRevenueMachineOption {
  id: string;
  machineId: string;
  machineClass: string;
  status: string;
  localLabel: string;
}

/** マシン詳細（useMachineDetailPage） */
export interface MerchantMachineSpec {
  cpu: string | null;
  gpu: string | null;
  ramGb: number | null;
  storageGb: number | null;
}

export type MerchantMachineDetailStatus =
  | 'REGISTERED'
  | 'ACTIVE'
  | 'PAUSED'
  | 'MAINTENANCE'
  | 'DECOMMISSIONED';

export interface MerchantMachineDetail {
  id: string;
  machineId: string;
  venueId: string;
  venueName: string;
  venueAddress: string;
  machineClass: 'GPU' | 'CPU' | 'STANDARD' | 'PREMIUM';
  label: string;
  spec: MerchantMachineSpec;
  status: MerchantMachineDetailStatus;
  onchainTokenId: string | null;
  onchainTxHash: string | null;
  computeEnabled: boolean;
  sessionsTotal: number;
  earningsTotalMinor: number;
}

export interface MerchantSlotWindow {
  from: string;
  to: string;
  status: 'AVAILABLE' | 'OCCUPIED' | 'BLOCKED';
  slotType: 'USAGE' | 'COMPUTE';
}

/** 店舗向け算力ノード管理用（merchant/compute ページ） */
export type MerchantNodeStatus = 'IDLE' | 'COMPUTING' | 'OFFLINE' | 'RESERVED';
export type MerchantTaskType = 'ML_TRAINING' | 'RENDERING' | 'ZK_PROVING' | 'GENERAL';

export interface AvailableWindow {
  dayOfWeek: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  startTime: string;
  endTime: string;
}

export interface ManagedNode {
  nodeId: string;
  seatId: string;
  seatLabel: string;
  specs: { cpuModel: string; cpuCores: number; gpuModel: string; vram: number; ram: number };
  status: MerchantNodeStatus;
  enabled: boolean;
  configured: boolean;
  pricePerHourMinor: number;
  minBookingHours: number;
  maxBookingHours: number;
  supportedTasks: MerchantTaskType[];
  availableWindows: AvailableWindow[];
  earnings: {
    thisMonthMinor: number;
    totalMinor: number;
    completedJobs: number;
    uptimePercent: number;
  };
}
