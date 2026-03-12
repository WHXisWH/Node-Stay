/**
 * ChainSyncService: syncOnce の loading/error 最小テスト。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChainSyncService } from './chainSync.service';

const mockSetChainSyncStore = vi.fn();
vi.mock('../stores/chainSync.store', () => ({
  getChainSyncStore: () => ({}),
  setChainSyncStore: (s: unknown) => mockSetChainSyncStore(s),
}));

const mockSyncOnce = vi.fn();
const mockGetChainSyncStatus = vi.fn();
vi.mock('../indexed', () => ({
  syncComputeMarketOnce: (...args: unknown[]) => mockSyncOnce(...args),
  getChainSyncStatus: (...args: unknown[]) => mockGetChainSyncStatus(...args),
}));

vi.mock('./config', () => ({
  CHAIN_CONFIG: { id: 80002 },
  CONTRACT_ADDRESSES: { computeMarket: '0x1234' },
}));

describe('ChainSyncService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetChainSyncStatus.mockResolvedValue({
      isSyncing: false,
      chainId: 80002,
      contractAddress: '0x1234',
      lastProcessedBlock: 100,
      lastFinalizedBlock: 100,
    });
  });

  it('syncOnce sets loading true then false on success', async () => {
    mockSyncOnce.mockResolvedValue(undefined);

    await ChainSyncService.syncOnce();

    const calls = mockSetChainSyncStore.mock.calls;
    expect(calls[0][0]).toMatchObject({ loading: true, error: null });
    expect(calls.some((c: unknown[]) => (c[0] as { loading?: boolean }).loading === false)).toBe(true);
  });

  it('syncOnce sets error on sync failure', async () => {
    mockSyncOnce.mockRejectedValue(new Error('RPC failed'));

    await expect(ChainSyncService.syncOnce()).rejects.toThrow('RPC failed');

    const errorCall = mockSetChainSyncStore.mock.calls.find(
      (c: unknown[]) => (c[0] as { error?: string }).error != null
    );
    expect(errorCall).toBeDefined();
    expect((errorCall?.[0] as { error: string }).error).toBe('RPC failed');
  });
});
