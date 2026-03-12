/**
 * 収益関連のドメインモデル
 * ダッシュボード / 請求フロー用
 */

export type RevenueRightStatus = 'ACTIVE' | 'EXPIRED';

export type ClaimLifecycleStatus = 'idle' | 'submitting' | 'pending' | 'finalized' | 'failed';

/** 収益プログラム */
export interface RevenueProgram {
  programId: string;
  nodeId: string;
  machineName: string;
  venueId: string;
  venueName: string;
  settlementCycle: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  startAt: string;
  endAt: string;
  status: RevenueRightStatus;
}

/** 収益権 */
export interface RevenueRight {
  id: string;
  programId: string;
  program: RevenueProgram;
  holdAmount: number;
  totalSupply: number;
  sharePercent: number;
  status: RevenueRightStatus;
}

/** 収益配分 */
export interface Allocation {
  allocationId: string;
  programId: string;
  programName: string;
  periodLabel: string;
  totalAmountMinor: number;
  myAmountMinor: number;
  claimed: boolean;
  claimableUntil: string;
  claimStatus?: ClaimLifecycleStatus;
  claimTxHash?: string | null;
  claimError?: string | null;
}

/** 請求対象 */
export interface ClaimTarget {
  programId: string;
  allocationId: string;
  revenueRightId: string;
}
