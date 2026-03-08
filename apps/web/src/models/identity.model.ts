/**
 * Identity verification model types.
 * Aligned with API and @nodestay/domain IdentityVerification.
 */

/** Input for POST /v1/identity/verify */
export interface VerifyIdentityInput {
  userId: string;
  venueId: string;
}

/** Response from POST /v1/identity/verify */
export interface VerifyIdentityResult {
  identityVerificationId: string;
}

/** Re-export domain type for full verification record when needed */
export type { IdentityVerification } from '@nodestay/domain';
