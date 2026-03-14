/**
 * UserService: getBalance の結果を user.store に反映する（SPEC §7, S5）。
 */

import type { NodeStayClient } from '@nodestay/api-client';
import type { Balance } from '../models/user.model';
import { useUserStore } from '../stores/user.store';
import { createNodeStayClient } from './nodestay';

export const UserService = {
  async getBalance(client?: NodeStayClient, walletAddress?: `0x${string}` | null): Promise<Balance> {
    const c = client ?? createNodeStayClient();
    const set = useUserStore.getState();
    set.setLoading(true);
    set.setError(null);
    try {
      const data = await c.getBalance(walletAddress ?? undefined);
      const balance: Balance = {
        currency: data.currency,
        balanceMinor: data.balanceMinor,
        depositHeldMinor: data.depositHeldMinor,
      };
      set.setBalance(balance);
      set.setLoading(false);
      return balance;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load balance';
      set.setError(msg);
      set.setLoading(false);
      throw e;
    }
  },
};
