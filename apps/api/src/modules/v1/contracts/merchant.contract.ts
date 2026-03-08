import { z } from 'zod';

/** POST /v1/merchant/venues body */
export const CreateVenueBodySchema = z.object({
  name: z.string().min(1),
  address: z.string().min(1),
  timezone: z.string().min(1),
});
export type CreateVenueBody = z.infer<typeof CreateVenueBodySchema>;

/** POST /v1/merchant/venues response */
export const CreateVenueResponseSchema = z.object({
  venueId: z.string().min(1),
  name: z.string().min(1),
  address: z.string().min(1),
  timezone: z.string().min(1),
});
export type CreateVenueResponse = z.infer<typeof CreateVenueResponseSchema>;

/** PUT /v1/merchant/venues/:venueId/plans body */
export const UpsertPlanBodySchema = z.object({
  productId: z.string().min(1).optional(),
  name: z.string().min(1),
  baseDurationMinutes: z.number().int().positive(),
  basePriceMinor: z.number().int().nonnegative(),
  depositRequiredMinor: z.number().int().nonnegative(),
});
export type UpsertPlanBody = z.infer<typeof UpsertPlanBodySchema>;

/** PUT /v1/merchant/venues/:venueId/plans response */
export const PlanRecordSchema = z.object({
  productId: z.string().min(1),
  venueId: z.string().min(1),
  name: z.string().min(1),
  baseDurationMinutes: z.number().int().positive(),
  basePriceMinor: z.number().int().nonnegative(),
  depositRequiredMinor: z.number().int().nonnegative(),
});
export type UpsertPlanResponse = z.infer<typeof PlanRecordSchema>;

/** POST/PUT /v1/merchant/venues/:venueId/seats body */
export const SeatTypeSchema = z.enum(['OPEN', 'BOOTH', 'FLAT', 'VIP']);
export const SeatStatusSchema = z.enum(['AVAILABLE', 'OCCUPIED', 'MAINTENANCE', 'COMPUTE_MODE']);
export const UpsertSeatBodySchema = z.object({
  seatId: z.string().min(1).optional(),
  type: SeatTypeSchema,
  status: SeatStatusSchema.optional(),
});
export type UpsertSeatBody = z.infer<typeof UpsertSeatBodySchema>;

/** POST/PUT seats response */
export const SeatRecordSchema = z.object({
  seatId: z.string().min(1),
  venueId: z.string().min(1),
  type: SeatTypeSchema,
  status: SeatStatusSchema,
});
export type UpsertSeatResponse = z.infer<typeof SeatRecordSchema>;

/** POST /v1/merchant/venues/:venueId/compute/enable body */
export const EnableComputeBodySchema = z.object({
  enable: z.boolean().default(true),
});
export type EnableComputeBody = z.infer<typeof EnableComputeBodySchema>;

/** POST /v1/merchant/venues/:venueId/compute/enable response */
export const EnableComputeResponseSchema = z.object({
  venueId: z.string().min(1),
  computeEnabled: z.boolean(),
});
export type EnableComputeResponse = z.infer<typeof EnableComputeResponseSchema>;

/** POST /v1/merchant/disputes body */
export const CreateDisputeBodySchema = z.object({
  venueId: z.string().min(1),
  reason: z.string().min(1),
});
export type CreateDisputeBody = z.infer<typeof CreateDisputeBodySchema>;

/** POST /v1/merchant/disputes response */
export const CreateDisputeResponseSchema = z.object({
  disputeId: z.string().min(1),
  venueId: z.string().min(1),
  reason: z.string().min(1),
  status: z.enum(['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED']),
  createdAtIso: z.string().min(1),
});
export type CreateDisputeResponse = z.infer<typeof CreateDisputeResponseSchema>;
