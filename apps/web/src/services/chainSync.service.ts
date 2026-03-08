/**
 * ChainSyncService: start/stop/syncOnce/status を提供し、同期状態を chainSync.store に反映する（S10, W12）。
 */

import { syncComputeMarketOnce, getChainSyncStatus } from '../indexed';
import { CHAIN_CONFIG, CONTRACT_ADDRESSES } from './config';
import type { ChainSyncStatus } from '../stores/chainSync.store';
import { getChainSyncStore, setChainSyncStore } from '../stores/chainSync.store';

export const ChainSyncService = {
  async start(): Promise<void> {
    setChainSyncStore({ status: null, loading: false, error: null });
  },

  async stop(): Promise<void> {
    setChainSyncStore({ status: null });
  },

  async syncOnce(): Promise<void> {
    setChainSyncStore({ loading: true, error: null });
    try {
      await syncComputeMarketOnce(
        { computeMarketAddress: CONTRACT_ADDRESSES.computeMarket as `0x${string}` },
        false
      );
      const status = await getChainSyncStatus(CHAIN_CONFIG.id, CONTRACT_ADDRESSES.computeMarket);
      setChainSyncStore({
        status: status ?? {
          isSyncing: false,
          chainId: 0,
          contractAddress: '',
          lastProcessedBlock: 0,
          lastFinalizedBlock: 0,
        },
        loading: false,
      });
    } catch (e) {
      setChainSyncStore({
        loading: false,
        error: e instanceof Error ? e.message : 'Sync failed',
      });
      throw e;
    }
  },

  async status(): Promise<ChainSyncStatus | null> {
    const s = getChainSyncStore().status;
    if (s) return s;
    const status = await getChainSyncStatus(CHAIN_CONFIG.id, CONTRACT_ADDRESSES.computeMarket);
    return status;
  },
};
