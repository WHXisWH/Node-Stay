import { z } from 'zod';

// 地理情報（現在は日本のみサポート）
export const JurisdictionSchema = z.object({
  country: z.literal('JP'),
  prefecture: z.string().min(1),
  city: z.string().min(1).optional(),
  ward: z.string().min(1).optional(),
});
export type Jurisdiction = z.infer<typeof JurisdictionSchema>;

// 店舗（Venue）
// 機器（Machine）を保有する物理的な営業拠点
export const VenueSchema = z.object({
  venueId: z.string().min(1),
  merchantId: z.string().min(1),
  name: z.string().min(1),
  address: z.string().min(1),
  jurisdiction: JurisdictionSchema,
  timezone: z.string().min(1),
  venueIdHash: z.string().min(1).optional(),   // オンチェーン識別用ハッシュ
  requiresKyc: z.boolean().default(false),     // KYC必須フラグ
  treasuryWallet: z.string().min(1).optional(), // 収益受取ウォレット
  status: z.enum(['ACTIVE', 'PAUSED', 'CLOSED']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Venue = z.infer<typeof VenueSchema>;
