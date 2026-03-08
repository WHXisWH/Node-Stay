import { z } from 'zod';

// 台帳エントリー種別（MachineFi 三市場の収支を統一管理）
export const LedgerEntryTypeSchema = z.enum([
  'PAYMENT',              // 使用権・算力権の購入代金
  'REFUND',               // 返金
  'DEPOSIT_HOLD',         // デポジット凍結
  'DEPOSIT_RELEASE',      // デポジット解放
  'DEPOSIT_CAPTURE',      // デポジット捕捉（精算）
  'REVENUE_DISTRIBUTION', // 収益権への分配
  'CLAIM',                // 収益権の引き出し
  'PLATFORM_FEE',         // プラットフォーム手数料
]);
export type LedgerEntryType = z.infer<typeof LedgerEntryTypeSchema>;

// 台帳エントリーの参照元種別
export const LedgerReferenceTypeSchema = z.enum([
  'USAGE',   // 使用権取引
  'SESSION', // セッション（使用）
  'COMPUTE', // 算力権取引
  'REVENUE', // 収益権
]);
export type LedgerReferenceType = z.infer<typeof LedgerReferenceTypeSchema>;

// 台帳エントリー（すべての金銭的な動きの記録）
export const LedgerEntrySchema = z.object({
  entryId: z.string().min(1),
  entryType: LedgerEntryTypeSchema,
  referenceType: LedgerReferenceTypeSchema,
  referenceId: z.string().min(1),
  fromWallet: z.string().min(1).optional(),
  toWallet: z.string().min(1).optional(),
  amountJpyc: z.string().regex(/^\d+$/),  // JPYC最小単位（wei相当）を文字列で保持
  txHash: z.string().min(1).optional(),
  status: z.enum(['PENDING', 'CONFIRMED', 'FAILED', 'REVERSED']),
  idempotencyKey: z.string().min(8).optional(),
  createdAt: z.string().datetime(),
  confirmedAt: z.string().datetime().optional(),
});
export type LedgerEntry = z.infer<typeof LedgerEntrySchema>;

// アウトボックスイベント（チェーン送信を保証するOutbox Pattern）
export const OutboxEventSchema = z.object({
  eventId: z.string().min(1),
  eventType: z.enum(['CHAIN_TRANSFER', 'PAYOUT_REQUEST', 'REFUND_REQUEST', 'REVENUE_CLAIM']),
  ledgerEntryId: z.string().min(1),
  status: z.enum(['NEW', 'SENT', 'CONFIRMED', 'FAILED']),
  createdAt: z.string().datetime(),
  lastTriedAt: z.string().datetime().optional(),
});
export type OutboxEvent = z.infer<typeof OutboxEventSchema>;
