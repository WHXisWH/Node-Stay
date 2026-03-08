import { z } from 'zod';

// 使用権の種別
export const UsageTypeSchema = z.enum([
  'HOURLY',    // 時間制
  'PACK',      // 時間パック（3時間・6時間など固定）
  'NIGHT',     // ナイトパック
  'FLEX',      // フレックス（開始時刻自由）
]);
export type UsageType = z.infer<typeof UsageTypeSchema>;

// 使用権のライフサイクル状態（新規格に準拠）
export const UsageStatusSchema = z.enum([
  'MINTED',      // 発行済み（購入完了）
  'LISTED',      // 二次市場に出品中
  'LOCKED',      // ロック中（チェックイン直前など）
  'CHECKED_IN',  // 使用中（チェックイン済み）
  'CONSUMED',    // 消費済み（チェックアウト完了）
  'EXPIRED',     // 期限切れ（未使用のまま有効期限超過）
  'CANCELLED',   // キャンセル済み
]);
export type UsageStatus = z.infer<typeof UsageStatusSchema>;

// 使用権商品（店舗が設定する販売商品）
export const UsageProductSchema = z.object({
  productId: z.string().min(1),
  venueId: z.string().min(1),
  machineId: z.string().min(1).optional(),
  productName: z.string().min(1),
  usageType: UsageTypeSchema,
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  durationMinutes: z.number().int().positive().optional(),
  transferable: z.boolean(),
  transferCutoffMinutes: z.number().int().nonnegative().default(60),
  maxTransferCount: z.number().int().nonnegative().default(1),
  kycLevelRequired: z.number().int().nonnegative().default(0),
  priceJpyc: z.string().regex(/^\d+$/),  // JPYC最小単位（wei相当）を文字列で保持
  metadataURI: z.string().min(1).optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type UsageProduct = z.infer<typeof UsageProductSchema>;

// チェーン参照情報（NFTトークン情報）
export const UsageRightChainRefSchema = z.object({
  tokenId: z.string().min(1),
  contractAddress: z.string().min(1),
  txHash: z.string().min(1),
});
export type UsageRightChainRef = z.infer<typeof UsageRightChainRefSchema>;

// 使用権（UsageRight）本体
// ERC-721 NFTとして発行される、機器使用の時間的権利
export const UsageRightSchema = z.object({
  usageRightId: z.string().min(1),
  usageProductId: z.string().min(1),
  machineId: z.string().min(1).optional(),
  ownerUserId: z.string().min(1),
  ownerWallet: z.string().min(1).optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional(),
  usageType: UsageTypeSchema,
  transferable: z.boolean(),
  transferCutoffAt: z.string().datetime().optional(),
  transferCount: z.number().int().nonnegative(),
  maxTransferCount: z.number().int().nonnegative(),
  kycLevelRequired: z.number().int().nonnegative(),
  status: UsageStatusSchema,
  chainRef: UsageRightChainRefSchema.optional(),
  metadataURI: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type UsageRight = z.infer<typeof UsageRightSchema>;

// 転売申請（二次市場への出品）
export const UsageListingSchema = z.object({
  listingId: z.string().min(1),
  usageRightId: z.string().min(1),
  sellerUserId: z.string().min(1),
  priceJpyc: z.string().regex(/^\d+$/),
  expiryAt: z.string().datetime().optional(),
  status: z.enum(['ACTIVE', 'CANCELLED', 'SOLD', 'EXPIRED']),
  buyerUserId: z.string().min(1).optional(),
  soldAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type UsageListing = z.infer<typeof UsageListingSchema>;

// 使用権転送の可否チェック結果
export const TransferCheckResultSchema = z.object({
  allowed: z.boolean(),
  reason: z.string().min(1).optional(),
});
export type TransferCheckResult = z.infer<typeof TransferCheckResultSchema>;

// 使用権の転送可否チェックロジック（純粋関数）
export function checkTransferAllowed(right: UsageRight, now: Date): TransferCheckResult {
  if (!right.transferable) {
    return { allowed: false, reason: '転送不可の使用権です' };
  }
  if (right.status === 'CHECKED_IN') {
    return { allowed: false, reason: 'チェックイン中は転送できません' };
  }
  if (right.status === 'CONSUMED' || right.status === 'EXPIRED' || right.status === 'CANCELLED') {
    return { allowed: false, reason: `ステータス ${right.status} の使用権は転送できません` };
  }
  if (right.transferCount >= right.maxTransferCount) {
    return { allowed: false, reason: '転送回数の上限に達しています' };
  }
  if (right.transferCutoffAt && now >= new Date(right.transferCutoffAt)) {
    return { allowed: false, reason: '転送期限を過ぎています' };
  }
  return { allowed: true };
}
