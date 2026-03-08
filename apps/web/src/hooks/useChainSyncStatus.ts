'use client';

/**
 * useChainSyncStatus: chainSync.store を読み取り専用で扱い、
 * syncOnce（ChainSyncService 呼び出し）を公開する（SPEC §8.2、TODO R7）。
 */

import { useCallback } from 'react';
import { useChainSyncStore } from '../stores/chainSync.store';
import { ChainSyncService } from '../services/chainSync.service';

export function useChainSyncStatus() {
  const status = useChainSyncStore((s) => s.status);
  const loading = useChainSyncStore((s) => s.loading);
  const error = useChainSyncStore((s) => s.error);

  const syncOnce = useCallback(() => ChainSyncService.syncOnce(), []);

  return {
    status,
    loading,
    error,
    syncOnce,
  };
}
