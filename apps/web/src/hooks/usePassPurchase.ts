'use client';

/**
 * usePassPurchase: pass.store を読み取り専用で扱い、
 * purchase（PassService 呼び出し）を公開する（SPEC §8、TODO R6）。
 */

import { useCallback } from 'react';
import { usePassStore } from '../stores/pass.store';
import { PassService } from '../services/pass.service';
import type { PurchasePassInput } from '../models/pass.model';

export function usePassPurchase() {
  const loading = usePassStore((s) => s.loading);
  const error = usePassStore((s) => s.error);
  const lastPurchase = usePassStore((s) => s.lastPurchase);

  const purchase = useCallback(
    (input: PurchasePassInput, idempotencyKey: string) =>
      PassService.purchase(input, idempotencyKey),
    []
  );

  return {
    passes: [] as Array<{ usageRightId: string; planName: string; venueName: string; status: string; remainingMinutes: number; expiresAt: string; depositAmountMinor: number; depositStatus: string; transferable: boolean }>,
    loading,
    error,
    purchaseLoading: loading,
    lastPurchaseResult: lastPurchase,
    purchase,
  };
}
