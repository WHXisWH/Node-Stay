import { z } from 'zod';

// 異議申立の状態
export const DisputeStatusSchema = z.enum(['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED']);
export type DisputeStatus = z.infer<typeof DisputeStatusSchema>;

// 異議申立の対象種別
export const DisputeReferenceTypeSchema = z.enum([
  'USAGE_RIGHT',
  'COMPUTE_RIGHT',
  'REVENUE_RIGHT',
  'SESSION',
]);
export type DisputeReferenceType = z.infer<typeof DisputeReferenceTypeSchema>;

// 異議申立
export const DisputeSchema = z.object({
  disputeId: z.string().min(1),
  referenceType: DisputeReferenceTypeSchema,
  referenceId: z.string().min(1),
  openerUserId: z.string().min(1),
  evidenceHash: z.string().min(1).optional(),  // 証拠ファイルのハッシュアンカー
  status: DisputeStatusSchema,
  resolutionNote: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  resolvedAt: z.string().datetime().optional(),
});
export type Dispute = z.infer<typeof DisputeSchema>;
