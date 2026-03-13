import { z } from 'zod';

/**
 * ヘルスチェック API コントラクト
 * GET /v1/health のレスポンス定義
 */

/** サービス個別のステータス */
const ServiceStatusSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error']),
  latency: z.number().optional(),
});

/** ブロックチェーン同期ステータス */
const BlockchainStatusSchema = z.object({
  status: z.enum(['ok', 'syncing', 'error']),
  blockHeight: z.number().optional(),
  syncDelay: z.number().optional(),
});

/** GET /v1/health レスポンス */
export const HealthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'error']),
  timestamp: z.string(),
  services: z.object({
    api: ServiceStatusSchema,
    database: ServiceStatusSchema,
    blockchain: BlockchainStatusSchema,
  }),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
