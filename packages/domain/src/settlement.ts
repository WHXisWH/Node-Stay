import { z } from 'zod';

// 結算種別（どの市場の収益か）
export const SettlementTypeSchema = z.enum(['USAGE', 'COMPUTE', 'REVENUE', 'MIXED']);
export type SettlementType = z.infer<typeof SettlementTypeSchema>;

// 結算（三方分配：店舗 / プラットフォーム / 収益権ホルダー）
export const SettlementSchema = z.object({
  settlementId: z.string().min(1),
  venueId: z.string().min(1),
  settlementType: SettlementTypeSchema,
  periodStart: z.string().datetime().optional(),
  periodEnd: z.string().datetime().optional(),
  grossAmountJpyc: z.string().regex(/^\d+$/),     // 総額（JPYC最小単位）
  venueShareJpyc: z.string().regex(/^\d+$/),      // 店舗取り分
  platformShareJpyc: z.string().regex(/^\d+$/),   // プラットフォーム取り分
  revenueShareJpyc: z.string().regex(/^\d+$/),    // 収益権ホルダー取り分
  txHash: z.string().min(1).optional(),
  status: z.enum(['PENDING', 'CONFIRMED', 'FAILED']),
  createdAt: z.string().datetime(),
});
export type Settlement = z.infer<typeof SettlementSchema>;

// Settlement コントラクトに渡す分配パラメータ
export const SettlementParamsSchema = z.object({
  sessionId: z.string().min(1),
  machineId: z.string().min(1),
  payerWallet: z.string().min(1),
  venueTreasuryWallet: z.string().min(1),
  grossAmountJpyc: z.string().regex(/^\d+$/),
  platformFeeBps: z.number().int().min(0).max(10000),
  revenueFeeBps: z.number().int().min(0).max(10000),
});
export type SettlementParams = z.infer<typeof SettlementParamsSchema>;
