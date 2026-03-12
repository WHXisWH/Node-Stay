'use client';

import { useChainSyncStore } from '../stores/chainSync.store';

export interface UseSyncStateReturn {
  chainSyncStatus: ReturnType<typeof useChainSyncStore.getState>['status'];
  chainSyncLastError: string | null;
}

export function useSyncState(): UseSyncStateReturn {
  const chainSyncStatus = useChainSyncStore((s) => s.status);
  const chainSyncLastError = useChainSyncStore((s) => s.lastError);

  return { chainSyncStatus, chainSyncLastError };
}
