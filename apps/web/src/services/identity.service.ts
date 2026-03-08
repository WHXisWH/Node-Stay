/**
 * IdentityService: verify（SPEC §7, S3）. No store; returns result.
 */

import type { NodeStayClient } from '@nodestay/api-client';
import type { VerifyIdentityInput, VerifyIdentityResult } from '../models/identity.model';
import { createNodeStayClient } from './nodestay';

export const IdentityService = {
  async verify(input: VerifyIdentityInput, client?: NodeStayClient): Promise<VerifyIdentityResult> {
    const c = client ?? createNodeStayClient();
    const data = await c.verifyIdentity({ userId: input.userId, venueId: input.venueId });
    return { identityVerificationId: data.identityVerificationId };
  },
};
