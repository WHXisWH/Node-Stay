/**
 * ComputeChainService: IndexedDB からオンチェーン由来の nodes/jobs を取得し、compute.store に反映する（W11）。
 */

import { listComputeNodes, listComputeJobsByRequester } from '../indexed';
import type { ComputeNodeRow, ComputeJobRow } from '../indexed';
import type { ComputeNode, ComputeJob } from '../models/compute.model';
import { setComputeStore } from '../models/stores/compute.store';

const defaultSpecs = {
  cpuModel: '',
  cpuCores: 0,
  gpuModel: '',
  vram: 0,
  ram: 0,
};

function nodeRowToModel(row: ComputeNodeRow): ComputeNode {
  return {
    nodeId: row.nodeId,
    venueId: row.venueOwner,
    specs: defaultSpecs,
    status: row.active ? 'IDLE' : 'OFFLINE',
    pricePerHourMinor: Number(row.pricePerHourMinor),
    minBookingHours: row.minBookingHours,
    maxBookingHours: row.maxBookingHours,
    supportedTasks: ['GENERAL'],
  };
}

function jobRowToModel(row: ComputeJobRow): ComputeJob {
  return {
    jobId: row.jobId,
    nodeId: row.nodeId,
    status: row.status,
    estimatedHours: row.estimatedHours,
    depositMinor: Number(row.depositMinor),
    startAt: row.startedAt ? new Date(row.startedAt * 1000).toISOString() : undefined,
    endAt: row.endedAt ? new Date(row.endedAt * 1000).toISOString() : undefined,
    resultHash: row.resultHash,
    taskType: 'GENERAL',
  };
}

export const ComputeChainService = {
  async listNodes(): Promise<ComputeNode[]> {
    const rows = await listComputeNodes();
    const nodes = rows.map(nodeRowToModel);
    setComputeStore({ nodes, error: null });
    return nodes;
  },

  async listMyJobs(requesterAddress: string): Promise<ComputeJob[]> {
    const rows = await listComputeJobsByRequester(requesterAddress);
    const jobs = rows.map(jobRowToModel);
    setComputeStore({ myJobs: jobs, error: null });
    return jobs;
  },
};
