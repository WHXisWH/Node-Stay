/**
 * ComputeService: HTTP 経由で submitJob / cancelJob / getJobResult を実行する（S7）。
 * 取得/送信結果を compute.store に反映する。オンチェーン由来データは ComputeChainService が IndexedDB から反映する（W11）。
 */

import type { NodeStayClient } from '@nodestay/api-client';
import { isAddress } from 'viem';
import type { ComputeNode, ComputeJob, SubmitJobInput } from '../models/compute.model';
import { setComputeStore, getComputeStore } from '../stores/compute.store';
import { useUserStore } from '../stores/user.store';
import type { TaskFilter } from '../stores/compute.store';
import { createNodeStayClient } from './nodestay';

/** Map API node item to app ComputeNode (minimal; IndexedDB/Chain fills rest) */
function toComputeNode(item: {
  nodeId: string;
  venueId: string;
  seatId: string;
  status: string;
  pricePerHourMinor: number;
  venueName?: string | null;
  address?: string | null;
  machineClass?: string | null;
  gpu?: string | null;
  cpu?: string | null;
  ramGb?: number | null;
  usageType?: string | null;
  maxDurationMinutes?: number | null;
}): ComputeNode {
  const usage = (item.usageType ?? '').toUpperCase();
  const machineClass = (item.machineClass ?? '').toUpperCase();
  const supportedTasks: ComputeNode['supportedTasks'] =
    usage.includes('ZK') || machineClass.includes('HIGH')
      ? ['ML_TRAINING', 'RENDERING', 'ZK_PROVING', 'GENERAL']
      : usage.includes('ML')
        ? ['ML_TRAINING', 'GENERAL']
        : usage.includes('RENDER')
          ? ['RENDERING', 'GENERAL']
          : ['GENERAL'];

  const maxBookingHours =
    item.maxDurationMinutes && item.maxDurationMinutes > 0
      ? Math.max(1, Math.floor(item.maxDurationMinutes / 60))
      : 24;

  return {
    nodeId: item.nodeId,
    venueId: item.venueId,
    seatId: item.seatId,
    venueName: item.venueName ?? undefined,
    address: item.address ?? undefined,
    status: item.status as ComputeNode['status'],
    pricePerHourMinor: item.pricePerHourMinor,
    specs: {
      cpuModel: item.cpu ?? '',
      cpuCores: 0,
      gpuModel: item.gpu ?? item.machineClass ?? '',
      vram: 0,
      ram: item.ramGb ?? 0,
    },
    minBookingHours: 1,
    maxBookingHours,
    supportedTasks,
    availableNow: item.status === 'IDLE',
  };
}

function fallbackTaskSpec(input: {
  nodeId: string;
  taskType: string;
  estimatedHours: number;
  taskSpec?: {
    command?: string;
    inputUri?: string;
    outputUri?: string;
    envVars?: Record<string, string>;
    dockerImage?: string;
  } | null;
}) {
  const command = input.taskSpec?.command?.trim() || `echo "NodeStay ${input.taskType} job"`;
  const inputUri = input.taskSpec?.inputUri?.trim() || `ipfs://nodestay/compute/${input.nodeId}/input`;
  const outputUri = input.taskSpec?.outputUri?.trim() || `ipfs://nodestay/compute/${input.nodeId}/output`;

  return {
    command,
    inputUri,
    outputUri,
    envVars: {
      ESTIMATED_HOURS: String(input.estimatedHours),
      TASK_TYPE: input.taskType,
      ...(input.taskSpec?.envVars ?? {}),
    },
    dockerImage: input.taskSpec?.dockerImage,
  };
}

export const ComputeService = {
  setTaskFilter(taskFilter: TaskFilter) {
    setComputeStore({ taskFilter });
  },
  setAvailableOnly(availableOnly: boolean) {
    setComputeStore({ availableOnly });
  },
  openBooking(nodeId: string) {
    setComputeStore({ bookingNodeId: nodeId });
  },
  closeBooking() {
    setComputeStore({ bookingNodeId: null });
  },

  async refresh(client?: NodeStayClient): Promise<void> {
    await this.listNodesFromHttp(client);
    await this.syncMyJobs(client);
  },

  async listNodesFromHttp(client?: NodeStayClient): Promise<ComputeNode[]> {
    const c = client ?? createNodeStayClient();
    setComputeStore({ loading: true, error: null });
    try {
      const data = await c.listComputeNodes();
      const nodes = data.map(toComputeNode);
      setComputeStore({ nodes, loading: false, error: null });
      return nodes;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load nodes';
      setComputeStore({ loading: false, error: msg });
      throw e;
    }
  },

  async submitJob(
    params: SubmitJobInput & { requesterId?: string },
    client?: NodeStayClient
  ): Promise<{ jobId: string }> {
    const c = client ?? createNodeStayClient();
    const { bookingNodeId } = getComputeStore();
    setComputeStore({ submitting: true, error: null });
    try {
      const taskSpec = fallbackTaskSpec({
        nodeId: params.nodeId,
        estimatedHours: params.estimatedHours,
        taskType: params.taskType,
        taskSpec: params.taskSpec,
      });
      const user = useUserStore.getState();
      const requesterWallet =
        user.loginMethod === 'social'
          ? (user.aaWalletAddress ?? user.socialWalletAddress ?? user.walletAddress)
          : user.walletAddress;
      if (!requesterWallet || !isAddress(requesterWallet)) {
        throw new Error('ウォレット未接続のためジョブ送信できません');
      }
      const res = await c.submitComputeJob({
        requesterId: params.requesterId ?? requesterWallet,
        payerWallet: params.payerWallet ?? requesterWallet,
        nodeId: params.nodeId,
        estimatedHours: params.estimatedHours,
        taskType: params.taskType,
        taskSpec: {
          command: taskSpec.command,
          inputUri: taskSpec.inputUri,
          outputUri: taskSpec.outputUri,
          envVars: taskSpec.envVars ?? {},
          dockerImage: taskSpec.dockerImage,
        },
        paymentTxHash: params.paymentTxHash,
      });
      const node = getComputeStore().nodes.find((n) => n.nodeId === bookingNodeId);
      const newJob: ComputeJob = {
        jobId: res.jobId,
        requesterId: params.requesterId ?? requesterWallet,
        nodeId: params.nodeId,
        taskType: params.taskType as ComputeJob['taskType'],
        taskSpec,
        status: 'PENDING',
        estimatedHours: params.estimatedHours,
        priceMinor: (node?.pricePerHourMinor ?? 0) * params.estimatedHours,
        depositMinor: Math.floor(((node?.pricePerHourMinor ?? 0) * params.estimatedHours) * 0.2),
        venueName: node?.venueName,
      };

      const prevJobs = getComputeStore().myJobs;
      setComputeStore({
        myJobs: [newJob, ...prevJobs.filter((j) => j.jobId !== newJob.jobId)],
      });
      setComputeStore({ submitting: false, submitSuccess: true, bookingNodeId: null });
      setTimeout(() => setComputeStore({ submitSuccess: false }), 5000);
      return { jobId: res.jobId };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Submit job failed';
      setComputeStore({ submitting: false, error: msg });
      throw e;
    }
  },

  async cancelJob(jobId: string, client?: NodeStayClient): Promise<void> {
    const c = client ?? createNodeStayClient();
    try {
      await c.cancelComputeJob(jobId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Cancel job failed';
      setComputeStore((s) => ({ ...s, error: msg }));
      throw e;
    }
  },

  async getJobResult(jobId: string, client?: NodeStayClient): Promise<{ jobId: string; resultUri: string | null }> {
    const c = client ?? createNodeStayClient();
    return await c.getComputeJobResult(jobId);
  },

  async syncMyJobs(client?: NodeStayClient): Promise<void> {
    const c = client ?? createNodeStayClient();
    const current = getComputeStore().myJobs;
    if (current.length === 0) return;

    const refreshed = await Promise.all(
      current.map(async (job) => {
        try {
          const [latest, result] = await Promise.all([
            c.getComputeJob(job.jobId),
            c.getComputeJobResult(job.jobId),
          ]);
          const next: ComputeJob = {
            ...job,
            status: latest.status as ComputeJob['status'],
          };
          if (result.resultUri) next.resultHash = result.resultUri;
          return next;
        } catch {
          return job;
        }
      }),
    );

    setComputeStore({ myJobs: refreshed });
  },
};
