import { z } from 'zod';

/** GET /v1/compute/nodes response item */
export const ComputeNodeStatusSchema = z.enum(['IDLE', 'RESERVED', 'COMPUTING', 'OFFLINE']);
export const ComputeNodeItemSchema = z.object({
  nodeId: z.string().min(1),
  venueId: z.string().min(1),
  seatId: z.string().min(1),
  status: ComputeNodeStatusSchema,
  pricePerHourMinor: z.number().int().nonnegative(),
});
export type ComputeNodeItem = z.infer<typeof ComputeNodeItemSchema>;

/** GET /v1/compute/nodes response */
export const ComputeNodesListResponseSchema = z.array(ComputeNodeItemSchema);
export type ComputeNodesListResponse = z.infer<typeof ComputeNodesListResponseSchema>;

/** POST /v1/compute/jobs body */
export const TaskSpecSchema = z.object({
  command: z.string().min(1),
  inputUri: z.string().min(1),
  outputUri: z.string().min(1),
  envVars: z.record(z.string()),
  dockerImage: z.string().min(1).optional(),
});
export const SubmitJobBodySchema = z.object({
  requesterId: z.string().min(1).optional(),
  nodeId: z.string().min(1),
  estimatedHours: z.number().int().min(1),
  taskType: z.string().min(1),
  taskSpec: TaskSpecSchema,
  paymentTxHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
});
export type SubmitJobBody = z.infer<typeof SubmitJobBodySchema>;

/** POST /v1/compute/jobs response */
export const SubmitJobResponseSchema = z.object({
  jobId: z.string().min(1),
  computeRightId: z.string().min(1),
  onchainTokenId: z.string().min(1),
  onchainTxHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
});
export type SubmitJobResponse = z.infer<typeof SubmitJobResponseSchema>;

/** GET /v1/compute/jobs/:jobId path param */
export const JobIdParamSchema = z.object({ jobId: z.string().min(1) });
export type JobIdParam = z.infer<typeof JobIdParamSchema>;

/** GET /v1/compute/jobs/:jobId response */
export const ComputeJobStatusSchema = z.enum([
  'PENDING',
  'ASSIGNED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);
export const GetJobResponseSchema = z.object({
  jobId: z.string().min(1),
  status: ComputeJobStatusSchema,
});
export type GetJobResponse = z.infer<typeof GetJobResponseSchema>;

/** POST /v1/compute/jobs/:jobId/cancel response */
export const CancelJobResponseSchema = z.object({
  jobId: z.string().min(1),
  cancelled: z.literal(true),
});
export type CancelJobResponse = z.infer<typeof CancelJobResponseSchema>;

/** GET /v1/compute/jobs/:jobId/result response */
export const JobResultResponseSchema = z.object({
  jobId: z.string().min(1),
  resultUri: z.string().nullable(),
});
export type JobResultResponse = z.infer<typeof JobResultResponseSchema>;
