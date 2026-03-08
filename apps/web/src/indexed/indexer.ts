/**
 * Chain event indexer (W6, W7): getLogs by block range → upsert IndexedDB.
 * Supports resumable sync, finalityDepth, and reorg rollback to lastFinalizedBlock.
 */

import { createPublicClient, http, parseAbiItem, decodeEventLog, type Log } from 'viem';
import { polygonAmoy } from 'viem/chains';
import { indexedDb } from './db';
import type { ChainSyncStateRow, ComputeNodeRow, ComputeJobRow } from './db';
import { CHAIN_CONFIG, CONTRACT_ADDRESSES } from '../services/config';

const FINALITY_DEPTH = 32;
const CHUNK_SIZE = 2000;

const computeMarketAbi = [
  parseAbiItem('event NodeRegistered(bytes32 indexed nodeId, address indexed venueOwner, uint256 pricePerHourMinor)'),
  parseAbiItem('event NodeUpdated(bytes32 indexed nodeId)'),
  parseAbiItem('event NodeDeactivated(bytes32 indexed nodeId)'),
  parseAbiItem('event NodeActivated(bytes32 indexed nodeId)'),
  parseAbiItem('event JobSubmitted(uint256 indexed jobId, bytes32 indexed nodeId, address indexed requester, uint256 depositMinor)'),
  parseAbiItem('event JobAssigned(uint256 indexed jobId)'),
  parseAbiItem('event JobStarted(uint256 indexed jobId, uint256 startedAt)'),
  parseAbiItem('event JobCompleted(uint256 indexed jobId, bytes32 resultHash, uint256 venueAmount, uint256 platformAmount)'),
  parseAbiItem('event JobFailed(uint256 indexed jobId, uint256 refundAmount)'),
  parseAbiItem('event JobCancelled(uint256 indexed jobId, uint256 refundAmount)'),
] as const;

function getClient(chainId: number, rpcUrl: string) {
  const chain =
    chainId === 80002
      ? polygonAmoy
      : {
          id: chainId,
          name: 'Unknown',
          nativeCurrency: { decimals: 18, name: 'MATIC', symbol: 'MATIC' },
          rpcUrls: { default: { http: [rpcUrl] } },
        };
  return createPublicClient({
    chain,
    transport: http(rpcUrl),
  });
}

export interface IndexerConfig {
  chainId: number;
  rpcUrl: string;
  computeMarketAddress: `0x${string}`;
  deploymentBlock: number;
}

const defaultConfig: IndexerConfig = {
  chainId: CHAIN_CONFIG.id,
  rpcUrl: CHAIN_CONFIG.rpcUrl,
  computeMarketAddress: CONTRACT_ADDRESSES.computeMarket as `0x${string}`,
  deploymentBlock: 0,
};

function toHexBytes32(v: unknown): string {
  if (typeof v === 'string' && v.startsWith('0x')) return v;
  if (typeof v === 'bigint') return '0x' + v.toString(16).padStart(64, '0');
  return String(v);
}

function toAddress(v: unknown): string {
  if (typeof v === 'string') return v.toLowerCase();
  return String(v);
}

/** Load or create chain_sync_state row */
async function getOrCreateSyncState(
  chainId: number,
  contractAddress: string,
  deploymentBlock: number
): Promise<ChainSyncStateRow> {
  const key = [chainId, contractAddress.toLowerCase()] as [number, string];
  let row = await indexedDb.chain_sync_state.get(key);
  if (!row) {
    row = {
      chainId,
      contractAddress: contractAddress.toLowerCase(),
      deploymentBlock,
      lastProcessedBlock: deploymentBlock - 1,
      lastFinalizedBlock: deploymentBlock - 1,
      updatedAtIso: new Date().toISOString(),
    };
    await indexedDb.chain_sync_state.add(row);
  }
  return row;
}

/** Persist sync state */
async function putSyncState(row: ChainSyncStateRow, lastError?: string): Promise<void> {
  await indexedDb.chain_sync_state.put({ ...row, updatedAtIso: new Date().toISOString(), lastError });
}

/** Decode log with viem (handles raw log from getLogs) */
function decodeLog(log: Log): { eventName: string; args: Record<string, unknown> } | null {
  try {
    const d = decodeEventLog({
      abi: [...computeMarketAbi],
      data: log.data,
      topics: log.topics,
    });
    return { eventName: d.eventName, args: (d.args as Record<string, unknown>) ?? {} };
  } catch {
    return null;
  }
}

/** Apply one ComputeMarket log to Read Model (nodes/jobs) */
async function applyComputeLog(
  chainId: number,
  log: Log,
  nodes: Map<string, ComputeNodeRow>,
  jobs: Map<string, ComputeJobRow>,
  saveRawEvent: boolean
): Promise<void> {
  const block = Number(log.blockNumber);
  const decoded = decodeLog(log);
  if (!decoded) return;

  const { eventName, args } = decoded;

  if (eventName === 'NodeRegistered') {
    const nodeId = toHexBytes32(args.nodeId);
    nodes.set(nodeId, {
      chainId,
      nodeId,
      venueOwner: toAddress(args.venueOwner),
      pricePerHourMinor: String(args.pricePerHourMinor ?? 0),
      minBookingHours: 1,
      maxBookingHours: 8760,
      active: true,
      updatedAtBlock: block,
    });
  }
  if (eventName === 'NodeUpdated' || eventName === 'NodeActivated' || eventName === 'NodeDeactivated') {
    const nodeId = toHexBytes32(args.nodeId);
    const existing = nodes.get(nodeId) ?? {
      chainId,
      nodeId,
      venueOwner: '',
      pricePerHourMinor: '0',
      minBookingHours: 1,
      maxBookingHours: 8760,
      active: true,
      updatedAtBlock: block,
    };
    if (eventName === 'NodeDeactivated') existing.active = false;
    if (eventName === 'NodeActivated') existing.active = true;
    existing.updatedAtBlock = block;
    nodes.set(nodeId, existing);
  }

  if (eventName === 'JobSubmitted') {
    const jobId = String(args.jobId ?? 0);
    jobs.set(jobId, {
      chainId,
      jobId,
      nodeId: toHexBytes32(args.nodeId),
      requester: toAddress(args.requester),
      depositMinor: String(args.depositMinor ?? 0),
      estimatedHours: 0,
      status: 'PENDING',
      updatedAtBlock: block,
    });
  }
  if (eventName === 'JobAssigned') {
    const jobId = String(args.jobId ?? 0);
    const existing = jobs.get(jobId);
    if (existing) {
      existing.status = 'ASSIGNED';
      existing.updatedAtBlock = block;
      jobs.set(jobId, existing);
    }
  }
  if (eventName === 'JobStarted') {
    const jobId = String(args.jobId ?? 0);
    const existing = jobs.get(jobId);
    if (existing) {
      existing.status = 'RUNNING';
      existing.startedAt = typeof args.startedAt === 'bigint' ? Number(args.startedAt) : undefined;
      existing.updatedAtBlock = block;
      jobs.set(jobId, existing);
    }
  }
  if (eventName === 'JobCompleted') {
    const jobId = String(args.jobId ?? 0);
    const existing = jobs.get(jobId);
    if (existing) {
      existing.status = 'COMPLETED';
      existing.endedAt = block;
      if (args.resultHash != null) existing.resultHash = toHexBytes32(args.resultHash);
      existing.updatedAtBlock = block;
      jobs.set(jobId, existing);
    }
  }
  if (eventName === 'JobFailed' || eventName === 'JobCancelled') {
    const jobId = String(args.jobId ?? 0);
    const existing = jobs.get(jobId);
    if (existing) {
      existing.status = eventName === 'JobFailed' ? 'FAILED' : 'CANCELLED';
      existing.endedAt = block;
      existing.updatedAtBlock = block;
      jobs.set(jobId, existing);
    }
  }

  if (saveRawEvent) {
    await indexedDb.events.put({
      chainId,
      txHash: log.transactionHash ?? '',
      logIndex: log.logIndex ?? 0,
      blockNumber: block,
      address: (log.address ?? '').toLowerCase(),
      eventName,
      args: JSON.stringify(args),
    });
  }
}

/** Single sync cycle: fetch logs from (lastProcessedBlock+1) to (head - finalityDepth), apply, persist */
export async function syncComputeMarketOnce(
  config: Partial<IndexerConfig> = {},
  saveRawEvents = false
): Promise<{ processed: number; lastProcessedBlock: number; lastFinalizedBlock: number; error?: string }> {
  const cfg = { ...defaultConfig, ...config };
  const client = getClient(cfg.chainId, cfg.rpcUrl);
  const contract = cfg.computeMarketAddress.toLowerCase();

  const state = await getOrCreateSyncState(cfg.chainId, contract, cfg.deploymentBlock);
  let fromBlock = state.lastProcessedBlock + 1;

  const blockNumber = await client.getBlockNumber().catch((e) => {
    throw new Error(`RPC getBlockNumber: ${e instanceof Error ? e.message : String(e)}`);
  });
  const head = Number(blockNumber);
  const safeHead = Math.max(state.deploymentBlock, head - FINALITY_DEPTH);
  const toBlock = Math.min(safeHead, fromBlock + CHUNK_SIZE - 1);

  if (fromBlock > toBlock) {
    const lastFinalized = Math.min(head - FINALITY_DEPTH, state.lastFinalizedBlock);
    await putSyncState({
      ...state,
      lastFinalizedBlock: lastFinalized,
    });
    return {
      processed: 0,
      lastProcessedBlock: state.lastProcessedBlock,
      lastFinalizedBlock: lastFinalized,
    };
  }

  // W7: Reorg check — if we have a stored hash for lastFinalizedBlock, verify it still matches
  if (state.lastFinalizedBlock >= state.deploymentBlock && state.lastFinalizedBlockHash) {
    const block = await client.getBlock({ blockNumber: BigInt(state.lastFinalizedBlock) }).catch(() => null);
    const currentHash = block?.hash?.toLowerCase();
    if (currentHash && state.lastFinalizedBlockHash !== currentHash) {
      // Reorg: rollback to lastFinalizedBlock and re-sync from there
      await indexedDb.transaction('rw', indexedDb.compute_nodes, indexedDb.compute_jobs, indexedDb.chain_sync_state, async () => {
        await indexedDb.compute_nodes.where('chainId').equals(cfg.chainId).filter((n) => n.updatedAtBlock > state.lastFinalizedBlock).delete();
        await indexedDb.compute_jobs.where('chainId').equals(cfg.chainId).filter((j) => j.updatedAtBlock > state.lastFinalizedBlock).delete();
        await putSyncState({
          ...state,
          lastProcessedBlock: state.lastFinalizedBlock - 1,
          lastError: 'Reorg detected; rolled back',
        });
      });
      return syncComputeMarketOnce(config, saveRawEvents);
    }
  }

  const logs = await client.getLogs({
    address: cfg.computeMarketAddress as `0x${string}`,
    events: computeMarketAbi,
    fromBlock: BigInt(fromBlock),
    toBlock: BigInt(toBlock),
  });

  const nodes = new Map<string, ComputeNodeRow>();
  const jobs = new Map<string, ComputeJobRow>();
  const existingNodes = await indexedDb.compute_nodes.where('chainId').equals(cfg.chainId).toArray();
  const existingJobs = await indexedDb.compute_jobs.where('chainId').equals(cfg.chainId).toArray();
  existingNodes.forEach((n) => nodes.set(n.nodeId, n));
  existingJobs.forEach((j) => jobs.set(j.jobId, j));

  for (const log of logs as unknown as Log[]) {
    await applyComputeLog(cfg.chainId, log, nodes, jobs, saveRawEvents);
  }

  const lastFinalizedBlock = toBlock;
  const blockForHash = await client.getBlock({ blockNumber: BigInt(toBlock) }).catch(() => null);
  const lastFinalizedBlockHash = blockForHash?.hash?.toLowerCase();

  await indexedDb.transaction('rw', indexedDb.compute_nodes, indexedDb.compute_jobs, indexedDb.chain_sync_state, async () => {
    for (const n of nodes.values()) {
      await indexedDb.compute_nodes.put(n);
    }
    for (const j of jobs.values()) {
      await indexedDb.compute_jobs.put(j);
    }
    await putSyncState({
      ...state,
      lastProcessedBlock: toBlock,
      lastFinalizedBlock,
      lastFinalizedBlockHash,
    });
  });

  return {
    processed: logs.length,
    lastProcessedBlock: toBlock,
    lastFinalizedBlock,
  };
}
