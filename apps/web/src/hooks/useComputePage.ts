/**
 * useComputePage: コンピュートマーケット Controller（SPEC §8.1）。
 * compute.store を読み取り専用で扱い、ComputeService を呼び出す。
 * 型と MOCK は models / service 側で管理する。
 */

import { useEffect, useMemo, useState } from 'react';
import { useComputeStore } from '../stores/compute.store';
import { ComputeService } from '../services/compute.service';
import type { ComputeNode, ComputeJob, TaskType } from '../models/compute.model';
import type { TaskFilter } from '../stores/compute.store';

export type ComputeTabKey = 'market' | 'my-jobs' | 'earnings';

export interface UseComputePageReturn {
  filteredNodes: ComputeNode[];
  myJobs: ComputeJob[];
  isLoading: boolean;
  error: string | null;
  taskFilter: TaskFilter;
  availableOnly: boolean;
  bookingNodeId: string | null;
  bookingNode: ComputeNode | null;
  submitting: boolean;
  submitSuccess: boolean;
  activeTab: ComputeTabKey;
  setActiveTab: (t: ComputeTabKey) => void;
  refresh: () => Promise<void>;
  openBooking: (nodeId: string) => void;
  closeBooking: () => void;
  setTaskFilter: (f: TaskFilter) => void;
  setAvailableOnly: (v: boolean) => void;
  submitJob: (params: { nodeId: string; estimatedHours: number; taskType: TaskType; taskSpec?: unknown; paymentTxHash?: string }) => Promise<void>;
  cancelJob: (jobId: string) => Promise<void>;
}

export function useComputePage(): UseComputePageReturn {
  const store = useComputeStore();
  const [activeTab, setActiveTab] = useState<ComputeTabKey>('market');

  useEffect(() => {
    ComputeService.refresh();
  }, []);

  const bookingNode = store.bookingNodeId
    ? store.nodes.find((n) => n.nodeId === store.bookingNodeId) ?? null
    : null;

  const filteredNodes = useMemo(() => {
    let list = [...store.nodes];
    if (store.availableOnly) {
      list = list.filter((n) => n.availableNow !== false);
    }
    if (store.taskFilter !== 'ALL') {
      list = list.filter((n) => n.supportedTasks?.includes(store.taskFilter as TaskType));
    }
    return list;
  }, [store.nodes, store.availableOnly, store.taskFilter]);

  const submitJob = async (params: { nodeId: string; estimatedHours: number; taskType: TaskType; taskSpec?: unknown; paymentTxHash?: string }) => {
    const raw = params.taskSpec;
    const taskSpec =
      raw &&
      typeof raw === 'object' &&
      'command' in raw &&
      'inputUri' in raw &&
      'outputUri' in raw
        ? (raw as { command: string; inputUri: string; outputUri: string; envVars?: Record<string, string>; dockerImage?: string })
        : {
            command: `echo "NodeStay ${params.taskType} job"`,
            inputUri: `ipfs://nodestay/compute/${params.nodeId}/input`,
            outputUri: `ipfs://nodestay/compute/${params.nodeId}/output`,
            envVars: {
              ESTIMATED_HOURS: String(params.estimatedHours),
              TASK_TYPE: params.taskType,
            },
          };
    await ComputeService.submitJob({
      nodeId: params.nodeId,
      estimatedHours: params.estimatedHours,
      taskType: params.taskType,
      taskSpec,
      paymentTxHash: params.paymentTxHash,
    });
  };

  return {
    filteredNodes,
    myJobs: store.myJobs,
    isLoading: store.loading,
    error: store.error,
    taskFilter: store.taskFilter,
    availableOnly: store.availableOnly,
    bookingNodeId: store.bookingNodeId,
    bookingNode,
    submitting: store.submitting,
    submitSuccess: store.submitSuccess,
    activeTab,
    setActiveTab,
    refresh: () => ComputeService.refresh(),
    openBooking: (nodeId) => ComputeService.openBooking(nodeId),
    closeBooking: () => ComputeService.closeBooking(),
    setTaskFilter: (f) => ComputeService.setTaskFilter(f),
    setAvailableOnly: (v) => ComputeService.setAvailableOnly(v),
    submitJob,
    cancelJob: (jobId) => ComputeService.cancelJob(jobId),
  };
}
