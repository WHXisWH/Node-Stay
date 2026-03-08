import { z } from 'zod';

// 算力権の状態（新規格に準拠）
export const ComputeStatusSchema = z.enum([
  'ISSUED',      // 発行済み（購入完了）
  'LISTED',      // 二次市場に出品中
  'RESERVED',    // 予約済み（タスク割当済み）
  'RUNNING',     // 実行中
  'COMPLETED',   // 完了
  'INTERRUPTED', // 中断（物理ユーザーに席を明け渡した等）
  'FAILED',      // 失敗
  'EXPIRED',     // 期限切れ
]);
export type ComputeStatus = z.infer<typeof ComputeStatusSchema>;

// コンピュートタスクの種別
export const ComputeTaskTypeSchema = z.enum([
  'ML_INFERENCE',  // AI推論
  'ML_TRAINING',   // AI学習
  'RENDERING',     // 3Dレンダリング
  'ZK_PROVING',    // ZKP生成
  'GENERAL',       // 汎用バッチ処理
]);
export type ComputeTaskType = z.infer<typeof ComputeTaskTypeSchema>;

// 算力商品（店舗が機器の空き時間帯に設定する算力商品）
export const ComputeProductSchema = z.object({
  productId: z.string().min(1),
  machineId: z.string().min(1),
  computeTier: z.string().min(1),          // 例: "RTX3060", "RTX4090"
  startWindow: z.string().datetime(),       // 提供可能時間帯の開始
  endWindow: z.string().datetime(),         // 提供可能時間帯の終了
  maxDurationMinutes: z.number().int().positive(),
  preemptible: z.boolean(),                // 物理ユーザー優先による中断許可
  settlementPolicy: z.enum(['FIXED', 'PRO_RATA']), // 中断時の精算ポリシー
  priceJpyc: z.string().regex(/^\d+$/),
  metadataURI: z.string().min(1).optional(),
  status: z.enum(['ACTIVE', 'PAUSED', 'ARCHIVED']),
  createdAt: z.string().datetime(),
});
export type ComputeProduct = z.infer<typeof ComputeProductSchema>;

// 算力権（ERC-721 NFTとして発行される算力使用権）
export const ComputeRightSchema = z.object({
  computeRightId: z.string().min(1),
  productId: z.string().min(1),
  machineId: z.string().min(1),
  ownerUserId: z.string().min(1),
  ownerWallet: z.string().min(1).optional(),
  onchainTokenId: z.string().min(1).optional(),
  onchainTxHash: z.string().min(1).optional(),
  status: ComputeStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ComputeRight = z.infer<typeof ComputeRightSchema>;

// コンピュートジョブ（実際のタスク実行記録）
export const ComputeJobStatusSchema = z.enum([
  'PENDING',
  'ASSIGNED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'INTERRUPTED',
]);
export type ComputeJobStatus = z.infer<typeof ComputeJobStatusSchema>;

export const ComputeJobSchema = z.object({
  jobId: z.string().min(1),
  computeRightId: z.string().min(1).optional(),
  buyerUserId: z.string().min(1),
  machineId: z.string().min(1).optional(),
  jobIdHash: z.string().min(1).optional(),        // オンチェーン識別用 keccak256 ハッシュ
  jobType: ComputeTaskTypeSchema,
  schedulerRef: z.string().min(1).optional(),
  status: ComputeJobStatusSchema,
  startedAt: z.string().datetime().optional(),
  endedAt: z.string().datetime().optional(),
  resultHash: z.string().min(1).optional(),       // 実行結果のハッシュアンカー
  interruptionReason: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ComputeJob = z.infer<typeof ComputeJobSchema>;
