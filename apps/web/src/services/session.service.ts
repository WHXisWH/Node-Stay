/**
 * SessionService: checkin / checkout の結果と状態を session.store に反映する（SPEC §7, S2）。
 */

import type { NodeStayClient } from '@nodestay/api-client';
import type { CheckInInput, CheckInResult, CheckOutInput, CheckOutResult } from '../models/session.model';
import { useSessionStore } from '../models/stores/session.store';
import { createNodeStayClient } from './nodestay';

export const SessionService = {
  async checkin(input: CheckInInput, client?: NodeStayClient): Promise<CheckInResult> {
    const c = client ?? createNodeStayClient();
    const set = useSessionStore.getState();
    set.setLoading(true);
    set.setError(null);
    try {
      const data = await c.checkinSession({
        usageRightId: input.usageRightId,
        venueId: input.venueId,
        machineId: input.machineId,
        identityVerificationId: input.identityVerificationId,
      });
      const result: CheckInResult = { sessionId: data.sessionId };
      set.setLastCheckIn(result);
      set.setLoading(false);
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Check-in failed';
      set.setError(msg);
      set.setLoading(false);
      throw e;
    }
  },

  async checkout(input: CheckOutInput, idempotencyKey: string, client?: NodeStayClient): Promise<CheckOutResult> {
    const c = client ?? createNodeStayClient();
    const set = useSessionStore.getState();
    set.setLoading(true);
    set.setError(null);
    try {
      const data = (await c.checkoutSession(
        { sessionId: input.sessionId },
        idempotencyKey
      )) as unknown as CheckOutResult;
      set.setLastCheckOut(data);
      set.setLoading(false);
      return data;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Check-out failed';
      set.setError(msg);
      set.setLoading(false);
      throw e;
    }
  },
};
