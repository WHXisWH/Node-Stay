/**
 * Pass purchase and usage-right list model types.
 * Aligned with API contracts and @nodestay/api-client.
 */

/** Input for POST /v1/usage-rights/purchase */
export interface PurchasePassInput {
  productId: string;
  ownerUserId?: string;
  buyerWallet?: string;
}

/** Response from POST /v1/usage-rights/purchase */
export interface PurchasePassResult {
  usageRightId: string;
}

/** Status for usage right (list) */
export type UsageRightStatus = 'ACTIVE' | 'IN_USE' | 'LISTED' | 'CONSUMED' | 'EXPIRED' | 'TRANSFERRED' | 'PENDING';

/** Usage right list item (for pass store + usePassesPage) */
export interface UsageRight {
  usageRightId: string;
  /** オンチェーン NFT tokenId（市場出售時に必要） */
  onchainTokenId?: string | null;
  planName: string;
  venueName: string;
  /** チェックインに必要な店舗 ID */
  venueId: string;
  status: UsageRightStatus;
  /** 残り利用時間（セッション使用分を差し引いた分） */
  remainingMinutes: number;
  /** プラン総時間（分）。プログレスバー分母用 */
  totalDurationMinutes: number;
  expiresAt: string;
  depositAmountMinor: number;
  depositStatus: 'NONE' | 'HELD' | 'PARTIALLY_CAPTURED' | 'RELEASED';
  transferable: boolean;
  /** LISTED 時のみ：出品 ID（キャンセル用） */
  listingId?: string | null;
  /** LISTED 時のみ：オンチェーン listing ID（キャンセル用） */
  onchainListingId?: string | null;
}

/** Usage right detail (for pass store + useUsageRightDetail) */
export interface UsageRightDetail {
  usageRightId: string;
  onchainTokenId: string | null;
  planName: string;
  planDurationMinutes: number;
  venueName: string;
  venueId: string;
  venueAddress: string;
  status: UsageRightStatus;
  remainingMinutes: number;
  purchasedAt: string;
  expiresAt: string;
  transferCutoff: string | null;
  transferable: boolean;
  transferCount: number;
  maxTransferCount: number;
  depositAmountMinor: number;
  depositStatus: 'NONE' | 'HELD' | 'PARTIALLY_CAPTURED' | 'RELEASED';
  basePriceMinor: number;
  txHash: string | null;
}
