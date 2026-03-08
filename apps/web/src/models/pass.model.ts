/**
 * Pass purchase model types.
 * Aligned with API contracts and @nodestay/api-client.
 */

/** Input for POST /v1/usage-rights/purchase */
export interface PurchasePassInput {
  productId: string;
  ownerUserId?: string;
}

/** Response from POST /v1/usage-rights/purchase */
export interface PurchasePassResult {
  usageRightId: string;
}
