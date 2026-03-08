import { z } from 'zod';

/** POST /v1/identity/verify body */
export const IdentityVerifyBodySchema = z.object({
  userId: z.string().min(1),
  venueId: z.string().min(1),
});
export type IdentityVerifyBody = z.infer<typeof IdentityVerifyBodySchema>;

/** POST /v1/identity/verify response */
export const IdentityVerifyResponseSchema = z.object({
  identityVerificationId: z.string().min(1),
});
export type IdentityVerifyResponse = z.infer<typeof IdentityVerifyResponseSchema>;
