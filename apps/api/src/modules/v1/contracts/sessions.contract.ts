import { z } from 'zod';

/** POST /v1/sessions/checkin body */
export const CheckInBodySchema = z.object({
  usageRightId: z.string().min(1),
  venueId: z.string().min(1),
  machineId: z.string().min(1).optional(),
  identityVerificationId: z.string().min(1).optional(),
});
export type CheckInBody = z.infer<typeof CheckInBodySchema>;

/** POST /v1/sessions/checkin response */
export const CheckInResponseSchema = z.object({
  sessionId: z.string().min(1),
});
export type CheckInResponse = z.infer<typeof CheckInResponseSchema>;

/** POST /v1/sessions/checkout body */
export const CheckoutBodySchema = z.object({
  sessionId: z.string().min(1),
  payerWallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
});
export type CheckoutBody = z.infer<typeof CheckoutBodySchema>;

/** POST /v1/sessions/checkout response */
export const CheckoutChargesSchema = z.object({
  baseMinor: z.number().int().nonnegative(),
  overtimeMinor: z.number().int().nonnegative(),
  amenitiesMinor: z.number().int().nonnegative(),
  damageMinor: z.number().int().nonnegative(),
});
export const CheckoutResponseSchema = z.object({
  usedMinutes: z.number().int().nonnegative(),
  charges: CheckoutChargesSchema,
});
export type CheckoutResponse = z.infer<typeof CheckoutResponseSchema>;
