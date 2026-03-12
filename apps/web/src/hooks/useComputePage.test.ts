/**
 * useComputePage: 最小テスト（戻り値の形・refresh 呼び出し）。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useComputePage } from './useComputePage';

vi.mock('../stores/compute.store', () => ({
  useComputeStore: () => ({
    nodes: [],
    myJobs: [],
    loading: false,
    error: null,
    taskFilter: 'ALL',
    availableOnly: false,
    bookingNodeId: null,
    submitSuccess: false,
    submitting: false,
  }),
}));

const mockRefresh = vi.fn();
const mockSubmitJob = vi.fn();
vi.mock('../services/compute.service', () => ({
  ComputeService: {
    refresh: () => mockRefresh(),
    submitJob: (...args: unknown[]) => mockSubmitJob(...args),
    cancelJob: vi.fn(),
  },
}));

describe('useComputePage', () => {
  beforeEach(() => {
    mockRefresh.mockReset();
    mockSubmitJob.mockReset();
  });

  it('returns expected shape and calls refresh on mount', async () => {
    const { result } = renderHook(() => useComputePage());

    expect(result.current).toMatchObject({
      filteredNodes: [],
      myJobs: [],
      isLoading: false,
      error: null,
      taskFilter: 'ALL',
      availableOnly: false,
      bookingNodeId: null,
      bookingNode: null,
      submitting: false,
      submitSuccess: false,
      activeTab: 'market',
    });
    expect(typeof result.current.refresh).toBe('function');
    expect(typeof result.current.submitJob).toBe('function');
    expect(typeof result.current.cancelJob).toBe('function');
    expect(typeof result.current.openBooking).toBe('function');
    expect(typeof result.current.closeBooking).toBe('function');
    expect(typeof result.current.setTaskFilter).toBe('function');
    expect(typeof result.current.setAvailableOnly).toBe('function');
    expect(typeof result.current.setActiveTab).toBe('function');

    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('refresh calls ComputeService.refresh', async () => {
    const { result } = renderHook(() => useComputePage());
    mockRefresh.mockClear();

    await act(async () => {
      await result.current.refresh();
    });

    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('submitJob が taskSpec 未指定時でも有効な既定値を送る', async () => {
    mockSubmitJob.mockResolvedValue(undefined);
    const { result } = renderHook(() => useComputePage());

    await act(async () => {
      await result.current.submitJob({
        nodeId: 'node-1',
        estimatedHours: 2,
        taskType: 'GENERAL',
      });
    });

    expect(mockSubmitJob).toHaveBeenCalledTimes(1);
    const payload = mockSubmitJob.mock.calls[0][0] as {
      taskSpec: { command: string; inputUri: string; outputUri: string; envVars?: Record<string, string> };
    };
    expect(payload.taskSpec.command.length).toBeGreaterThan(0);
    expect(payload.taskSpec.inputUri.length).toBeGreaterThan(0);
    expect(payload.taskSpec.outputUri.length).toBeGreaterThan(0);
    expect(payload.taskSpec.envVars?.TASK_TYPE).toBe('GENERAL');
  });
});
