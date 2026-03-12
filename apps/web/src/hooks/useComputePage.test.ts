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
vi.mock('../services/compute.service', () => ({
  ComputeService: {
    refresh: () => mockRefresh(),
    submitJob: vi.fn(),
    cancelJob: vi.fn(),
  },
}));

describe('useComputePage', () => {
  beforeEach(() => {
    mockRefresh.mockReset();
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
});
