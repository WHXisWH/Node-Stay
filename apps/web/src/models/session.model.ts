/**
 * Session check-in/check-out model types.
 * Aligned with API contracts and @nodestay/api-client.
 */

/** Input for POST /v1/sessions/checkin */
export interface CheckInInput {
  usageRightId: string;
  venueId: string;
  machineId?: string;
  identityVerificationId?: string;
}

/** Response from POST /v1/sessions/checkin */
export interface CheckInResult {
  sessionId: string;
}

/** Input for POST /v1/sessions/checkout (body) */
export interface CheckOutInput {
  sessionId: string;
  payerWallet?: `0x${string}`;
}

/** Charges breakdown from checkout response */
export interface CheckOutCharges {
  baseMinor: number;
  overtimeMinor: number;
  amenitiesMinor: number;
  damageMinor: number;
}

/** Response from POST /v1/sessions/checkout */
export interface CheckOutResult {
  usedMinutes: number;
  charges: CheckOutCharges;
}
