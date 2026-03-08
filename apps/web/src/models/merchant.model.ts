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

/** 店舗向けコンピュートノード管理用（merchant/compute ページ） */
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
