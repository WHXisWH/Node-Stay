/**
 * Re-export Compute API contract from shared package (I1).
 * Single source of truth: @nodestay/api-contracts.
 */
export {
  ComputeNodeStatusSchema,
  ComputeNodeItemSchema,
  ComputeNodesListResponseSchema,
  TaskSpecSchema,
  SubmitJobBodySchema,
  SubmitJobResponseSchema,
  JobIdParamSchema,
  ComputeJobStatusSchema,
  GetJobResponseSchema,
  CancelJobResponseSchema,
  JobResultResponseSchema,
} from '@nodestay/api-contracts';
export type {
  ComputeNodeItem,
  ComputeNodesListResponse,
  SubmitJobBody,
  SubmitJobResponse,
  JobIdParam,
  GetJobResponse,
  CancelJobResponse,
  JobResultResponse,
} from '@nodestay/api-contracts';
