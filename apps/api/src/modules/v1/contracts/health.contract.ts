import { z } from 'zod';

/** GET /v1/health response */
export const HealthResponseSchema = z.object({
  ok: z.literal(true),
});
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
