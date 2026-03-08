/**
 * IndexedDB schema (Dexie) for chain Read Model (W4, W5, W8, W9, W10).
 * Dedup key: (chainId, txHash, logIndex) for events; tables keyed for upsert by (chainId, id).
 */

import Dexie from 'dexie';

/** W5: per-chain per-contract sync cursor */
export interface ChainSyncStateRow {
  chainId: number;
  contractAddress: string;
  deploymentBlock: number;
  lastProcessedBlock: number;
  lastFinalizedBlock: number;
  /** For reorg detection (W7): hash of block at lastFinalizedBlock */
  lastFinalizedBlockHash?: string;
  updatedAtIso: string;
  lastError?: string;
}

/** W8: ComputeMarket node row (from NodeRegistered/Updated/Activated/Deactivated) */
export interface ComputeNodeRow {
  chainId: number;
  nodeId: string;
  venueOwner: string;
  pricePerHourMinor: string;
  minBookingHours: number;
  maxBookingHours: number;
  active: boolean;
  updatedAtBlock: number;
}

/** W8: ComputeMarket job row (from Job* events) */
export type ComputeJobStatusRow =
  | 'PENDING'
  | 'ASSIGNED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export interface ComputeJobRow {
  chainId: number;
  jobId: string;
  nodeId: string;
  requester: string;
  depositMinor: string;
  estimatedHours: number;
  status: ComputeJobStatusRow;
  startedAt?: number;
  endedAt?: number;
  resultHash?: string;
  updatedAtBlock: number;
}

/** W9: UsageRight row (legacy table name: passes) */
export interface PassRow {
  chainId: number;
  tokenId: string;
  owner: string;
  productId: number;
  venueId: number;
  remainingMinutes: number;
  expiresAt: number;
  isActive: boolean;
  transferable: boolean;
  updatedAtBlock: number;
}

/** W10: raw event row (optional, for debug/replay) */
export interface EventRow {
  chainId: number;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  address: string;
  eventName: string;
  args: string;
}

const DB_NAME = 'nodestay-indexed';

export class NodestayIndexedDB extends Dexie {
  chain_sync_state!: Dexie.Table<ChainSyncStateRow, [number, string]>;
  compute_nodes!: Dexie.Table<ComputeNodeRow, [number, string]>;
  compute_jobs!: Dexie.Table<ComputeJobRow, [number, string]>;
  passes!: Dexie.Table<PassRow, [number, string]>;
  events!: Dexie.Table<EventRow, [number, string, number]>;

  constructor() {
    super(DB_NAME);

    this.version(1).stores({
      chain_sync_state: '[chainId+contractAddress], chainId, lastProcessedBlock',
      compute_nodes: '[chainId+nodeId], chainId, venueOwner, active',
      compute_jobs: '[chainId+jobId], chainId, requester, nodeId, status',
      passes: '[chainId+tokenId], chainId, owner',
    });

    this.version(2).stores({
      chain_sync_state: '[chainId+contractAddress], chainId, lastProcessedBlock',
      compute_nodes: '[chainId+nodeId], chainId, venueOwner, active',
      compute_jobs: '[chainId+jobId], chainId, requester, nodeId, status',
      passes: '[chainId+tokenId], chainId, owner',
      events: '[chainId+txHash+logIndex], chainId, blockNumber',
    });
  }
}

export const indexedDb = new NodestayIndexedDB();
