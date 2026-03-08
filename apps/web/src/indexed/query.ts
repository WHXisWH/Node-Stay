/**
 * IndexedDB Read Model query API (W11). Used by ComputeChainService / PassChainReadService.
 */

import { indexedDb } from './db';
import type { ComputeNodeRow, ComputeJobRow, PassRow } from './db';

export interface ChainSyncStatus {
  isSyncing: boolean;
  chainId: number;
  contractAddress: string;
  lastProcessedBlock: number;
  lastFinalizedBlock: number;
  lastError?: string;
}

/** List all compute nodes from IndexedDB (all chains) */
export async function listComputeNodes(): Promise<ComputeNodeRow[]> {
  return indexedDb.compute_nodes.toArray();
}

/** List compute jobs by requester address (all chains) */
export async function listComputeJobsByRequester(requester: string): Promise<ComputeJobRow[]> {
  const lower = requester.toLowerCase();
  return indexedDb.compute_jobs.filter((j) => j.requester.toLowerCase() === lower).toArray();
}

/** List passes by owner address (all chains) */
export async function listPassesByOwner(owner: string): Promise<PassRow[]> {
  const lower = owner.toLowerCase();
  return indexedDb.passes.filter((p) => p.owner.toLowerCase() === lower).toArray();
}

/** Get sync status for a given chain+contract (for UI badge) */
export async function getChainSyncStatus(
  chainId: number,
  contractAddress: string
): Promise<ChainSyncStatus | null> {
  const row = await indexedDb.chain_sync_state.get([chainId, contractAddress.toLowerCase()]);
  if (!row) return null;
  return {
    isSyncing: false,
    chainId: row.chainId,
    contractAddress: row.contractAddress,
    lastProcessedBlock: row.lastProcessedBlock,
    lastFinalizedBlock: row.lastFinalizedBlock,
    lastError: row.lastError,
  };
}
