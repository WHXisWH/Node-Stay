import { z } from 'zod';

export const IdempotencyKeySchema = z
  .string()
  .min(8)
  .max(200)
  .regex(/^[A-Za-z0-9._-]+$/);
export type IdempotencyKey = z.infer<typeof IdempotencyKeySchema>;

export function normalizeIdempotencyKey(value: string): IdempotencyKey {
  return IdempotencyKeySchema.parse(value);
}

