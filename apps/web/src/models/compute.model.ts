/**
 * Compute (nodes/jobs) model types.
 * Migrated from compute/page; aligned with domain and IndexedDB Read Model.
 */

/** Task type filter (UI + chain) */
export type TaskType = 'ML_TRAINING' | 'RENDERING' | 'ZK_PROVING' | 'GENERAL';

/** Node status (domain ComputeNodeStatus) */
export type NodeStatus = 'IDLE' | 'RESERVED' | 'COMPUTING' | 'OFFLINE';

/** Job status (domain ComputeJobStatus / chain) */
export type JobStatus = 'PENDING' | 'ASSIGNED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

/** Specs for display (from domain or Indexed row) */
export interface ComputeNodeSpecs {
  cpuModel: string;
  cpuCores: number;
  gpuModel: string;
  vram: number;
  ram: number;
}

/** Compute node for list/card (domain + optional UI fields from Indexed) */
export interface ComputeNode {
  nodeId: string;
  seatId?: string;
  venueId?: string;
  venueName?: string;
  address?: string;
  specs: ComputeNodeSpecs;
  status: NodeStatus;
  availableWindows?: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
  pricePerHourMinor: number;
  minBookingHours: number;
  maxBookingHours: number;
  supportedTasks: TaskType[];
  /** UI-only: derived from status/windows */
  availableNow?: boolean;
}

/** Compute job for list (domain / Indexed) */
export interface ComputeJob {
  jobId: string;
  requesterId?: string;
  nodeId?: string;
  taskType: TaskType;
  taskSpec?: {
    dockerImage?: string;
    command: string;
    inputUri: string;
    outputUri: string;
    envVars?: Record<string, string>;
  };
  status: JobStatus;
  estimatedHours: number;
  actualHours?: number;
  priceMinor?: number;
  depositMinor?: number;
  venueName?: string;
  startAt?: string;
  endAt?: string;
  resultHash?: string;
  paymentTxHash?: string | null;
  onchainTxHash?: string | null;
}

/** Input for submitting a job (POST /v1/compute/jobs or chain submit) */
export interface SubmitJobInput {
  nodeId: string;
  estimatedHours: number;
  taskType: string;
  paymentTxHash?: string;
  payerWallet?: `0x${string}`;
  taskSpec: {
    command: string;
    inputUri: string;
    outputUri: string;
    envVars?: Record<string, string>;
    dockerImage?: string;
  };
}
