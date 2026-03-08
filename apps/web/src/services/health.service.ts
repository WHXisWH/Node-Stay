/**
 * HealthService: HealthBadge/Header から利用する軽量な health check Service（SPEC V7）。
 */

import type { NodeStayClient } from '@nodestay/api-client';
import { createNodeStayClient } from './nodestay';

export const HealthService = {
  async check(client?: NodeStayClient): Promise<{ ok: true }> {
    const c = client ?? createNodeStayClient();
    return await c.health();
  },
};
