import { z } from 'zod';

export const IdentityMethodSchema = z.enum([
  'DRIVER_LICENSE',
  'PASSPORT',
  'RESIDENCE_CARD',
  'MY_NUMBER_CARD',
  'OTHER',
]);
export type IdentityMethod = z.infer<typeof IdentityMethodSchema>;

export const IdentityVerifierSchema = z.enum(['STAFF', 'KIOSK', 'ONLINE']);
export type IdentityVerifier = z.infer<typeof IdentityVerifierSchema>;

export const IdentityVerificationSchema = z.object({
  identityVerificationId: z.string().min(1),
  userId: z.string().min(1),
  venueId: z.string().min(1),
  method: IdentityMethodSchema,
  verifiedAt: z.string().datetime(),
  verifier: IdentityVerifierSchema,
  capturedFields: z.object({
    name: z.string().min(1),
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    address: z.string().min(1),
  }),
  evidenceHash: z.string().min(1).optional(),
  retentionUntil: z.string().datetime(),
});
export type IdentityVerification = z.infer<typeof IdentityVerificationSchema>;

