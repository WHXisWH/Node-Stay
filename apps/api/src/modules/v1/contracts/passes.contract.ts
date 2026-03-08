import { z } from 'zod';

/** POST /v1/usage-rights/purchase body */
export const PurchasePassBodySchema = z.object({
  productId: z.string().min(1),
  ownerUserId: z.string().min(1).optional(),
});
export type PurchasePassBody = z.infer<typeof PurchasePassBodySchema>;

/** POST /v1/usage-rights/purchase response */
export const PurchasePassResponseSchema = z.object({
  usageRightId: z.string().min(1),
});
export type PurchasePassResponse = z.infer<typeof PurchasePassResponseSchema>;

/** POST /v1/usage-rights/:usageRightId/transfer response */
export const PassStatusSchema = z.enum([
  'ACTIVE',
  'IN_USE',
  'CONSUMED',
  'EXPIRED',
  'TRANSFERRED',
  'SUSPENDED',
  'REFUNDED',
  'DISPUTED',
]);
export const TransferPassResponseSchema = z.object({
  usageRightId: z.string().min(1),
  status: PassStatusSchema,
});
export type TransferPassResponse = z.infer<typeof TransferPassResponseSchema>;
