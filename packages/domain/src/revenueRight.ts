import { z } from 'zod';

// 収益権の収益対象スコープ
export const RevenueScopeSchema = z.enum([
  'USAGE_ONLY',    // Usage収益のみ
  'COMPUTE_ONLY',  // Compute収益のみ
  'ALL',           // 全収益
]);
export type RevenueScope = z.infer<typeof RevenueScopeSchema>;

// 収益権のライフサイクル状態
export const RevenueStatusSchema = z.enum([
  'ISSUED',   // 発行済み
  'ACTIVE',   // 有効（分配受取可能）
  'PAUSED',   // 一時停止
  'EXPIRED',  // 期限切れ
  'REDEEMED', // 償還済み
]);
export type RevenueStatus = z.infer<typeof RevenueStatusSchema>;

// 収益分配サイクル
export const SettlementCycleSchema = z.enum(['DAILY', 'WEEKLY', 'MONTHLY']);
export type SettlementCycle = z.infer<typeof SettlementCycleSchema>;

// 収益権プログラム（店舗が機器ごとに設定する収益共有プログラム）
// Phase 3 で実装。現在はスキーマ定義のみ。
export const RevenueProgramSchema = z.object({
  programId: z.string().min(1),
  machineId: z.string().min(1),
  shareBps: z.number().int().min(1).max(4000), // 最大 40% (4000 bps) 上限
  revenueScope: RevenueScopeSchema,
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  settlementCycle: SettlementCycleSchema,
  payoutToken: z.literal('JPYC'),
  metadataURI: z.string().min(1).optional(),
  status: RevenueStatusSchema,
  createdAt: z.string().datetime(),
});
export type RevenueProgram = z.infer<typeof RevenueProgramSchema>;

// 収益権（ERC-1155トークンとして発行される分配権）
export const RevenueRightSchema = z.object({
  revenueRightId: z.string().min(1),
  programId: z.string().min(1),
  machineId: z.string().min(1),
  holderUserId: z.string().min(1),
  holderWallet: z.string().min(1).optional(),
  onchainTokenId: z.string().min(1).optional(),
  amount1155: z.string().regex(/^\d+$/).optional(), // ERC-1155の保有数量
  onchainTxHash: z.string().min(1).optional(),
  status: RevenueStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type RevenueRight = z.infer<typeof RevenueRightSchema>;

// 収益配分記録（周期ごとの分配実績）
export const RevenueAllocationSchema = z.object({
  allocationId: z.string().min(1),
  programId: z.string().min(1),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  totalAmountJpyc: z.string().regex(/^\d+$/),
  allocationTxHash: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
});
export type RevenueAllocation = z.infer<typeof RevenueAllocationSchema>;

// 収益権クレーム記録（保有者が収益を引き出した記録）
export const RevenueClaimSchema = z.object({
  claimId: z.string().min(1),
  revenueRightId: z.string().min(1),
  allocationId: z.string().min(1),
  claimedAmountJpyc: z.string().regex(/^\d+$/),
  claimTxHash: z.string().min(1).optional(),
  claimedAt: z.string().datetime(),
});
export type RevenueClaim = z.infer<typeof RevenueClaimSchema>;
