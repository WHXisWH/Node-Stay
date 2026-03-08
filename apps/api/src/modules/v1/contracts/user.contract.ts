import { z } from 'zod';

/** GET /v1/user/balance response */
export const UserBalanceResponseSchema = z.object({
  currency: z.literal('JPYC'),
  balanceMinor: z.number().int().nonnegative(),
  depositHeldMinor: z.number().int().nonnegative(),
});
export type UserBalanceResponse = z.infer<typeof UserBalanceResponseSchema>;
