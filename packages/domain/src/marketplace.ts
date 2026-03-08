import { z } from 'zod';

// マーケットプレイスの出品種別
export const ListingTypeSchema = z.enum(['USAGE', 'COMPUTE', 'REVENUE']);
export type ListingType = z.infer<typeof ListingTypeSchema>;

// 出品状態
export const ListingStatusSchema = z.enum([
  'ACTIVE',    // 出品中
  'CANCELLED', // 出品取消
  'SOLD',      // 成約済み
  'EXPIRED',   // 期限切れ
]);
export type ListingStatus = z.infer<typeof ListingStatusSchema>;

// マーケットプレイス出品（Usage / Compute / Revenue 三市場を統一管理）
export const MarketplaceListingSchema = z.object({
  listingId: z.string().min(1),
  listingType: ListingTypeSchema,
  assetId: z.string().min(1),   // UsageRight / ComputeRight / RevenueRight の ID
  sellerUserId: z.string().min(1),
  sellerWallet: z.string().min(1).optional(),
  priceJpyc: z.string().regex(/^\d+$/),
  expiryAt: z.string().datetime().optional(),
  active: z.boolean(),
  buyerUserId: z.string().min(1).optional(),
  buyerWallet: z.string().min(1).optional(),
  soldAt: z.string().datetime().optional(),
  onchainListingId: z.string().min(1).optional(),
  onchainTxHash: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type MarketplaceListing = z.infer<typeof MarketplaceListingSchema>;

// 出品リクエスト（新規出品時の入力）
export const CreateListingRequestSchema = z.object({
  listingType: ListingTypeSchema,
  assetId: z.string().min(1),
  priceJpyc: z.string().regex(/^\d+$/),
  expiryAt: z.string().datetime().optional(),
});
export type CreateListingRequest = z.infer<typeof CreateListingRequestSchema>;
