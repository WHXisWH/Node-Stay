/**
 * User balance model types.
 * Aligned with GET /v1/user/balance response.
 */

export interface Balance {
  currency: 'JPYC';
  balanceMinor: number;
  depositHeldMinor: number;
}
