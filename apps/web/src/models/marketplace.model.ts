/**
 * マーケットプレイス一覧モデル
 * API と useMarketplacePage に合わせた型定義
 */

export type ListingType = 'USAGE' | 'COMPUTE' | 'REVENUE';
export type ListingStatus = 'ACTIVE' | 'SOLD' | 'CANCELLED' | 'EXPIRED';

/** マーケットプレイス出品 */
export interface MarketplaceListing {
  listingId: string;
  listingType: ListingType;
  planName: string;
  venueName: string;
  venueAddress: string;
  durationMinutes: number;
  remainingMinutes: number;
  expiresAt: string;
  transferable: boolean;
  sellerAddress: string;
  priceMinor: number;
  originalPriceMinor: number;
  status: ListingStatus;
  listedAt: string;
  onchainTokenId: string | null;
}
