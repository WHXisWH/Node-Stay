/**
 * PassService: purchase の結果と状態を pass.store に反映する（SPEC §7, S4）。
 */

import type { NodeStayClient } from '@nodestay/api-client';
import type { PurchasePassInput, PurchasePassResult } from '../models/pass.model';
import { usePassStore } from '../stores/pass.store';
import { createNodeStayClient } from './nodestay';

export const PassService = {
  async purchase(input: PurchasePassInput, idempotencyKey: string, client?: NodeStayClient): Promise<PurchasePassResult> {
    const c = client ?? createNodeStayClient();
    const set = usePassStore.getState();
    set.setLoading(true);
    set.setError(null);
    try {
      const data = await c.purchaseUsageRight(
        { productId: input.productId, ownerUserId: input.ownerUserId },
        idempotencyKey,
      );
      const result: PurchasePassResult = { usageRightId: data.usageRightId };
      set.setLastPurchase(result);
      set.setLoading(false);
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Purchase failed';
      set.setError(msg);
      set.setLoading(false);
      throw e;
    }
  },
};
