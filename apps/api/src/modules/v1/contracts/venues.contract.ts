import { z } from 'zod';

/** GET /v1/venues response item */
export const VenueItemSchema = z.object({
  venueId: z.string().min(1),
  name: z.string().min(1),
  address: z.string().min(1),
  timezone: z.string().min(1),
});
export type VenueItem = z.infer<typeof VenueItemSchema>;

/** GET /v1/venues response */
export const VenuesListResponseSchema = z.array(VenueItemSchema);
export type VenuesListResponse = z.infer<typeof VenuesListResponseSchema>;

/** GET /v1/venues/:venueId/plans response item */
export const PlanItemSchema = z.object({
  productId: z.string().min(1),
  venueId: z.string().min(1),
  name: z.string().min(1),
  baseDurationMinutes: z.number().int().positive(),
  basePriceMinor: z.number().int().nonnegative(),
  depositRequiredMinor: z.number().int().nonnegative(),
});
export type PlanItem = z.infer<typeof PlanItemSchema>;

/** GET /v1/venues/:venueId/plans response */
export const PlansListResponseSchema = z.array(PlanItemSchema);
export type PlansListResponse = z.infer<typeof PlansListResponseSchema>;
