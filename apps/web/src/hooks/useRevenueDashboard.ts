'use client';

/**
 * useRevenueDashboard — 投資家向け収益権ダッシュボード Hook
 * /v1/revenue 系 API と接続し、保有収益権・配当履歴・claim 操作を管理する
 * claim 操作はコントラクトを直接呼び出す（on-chain）
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { waitForTransactionReceipt } from '@wagmi/core';
import { useAccount, useConfig, useWriteContract } from 'wagmi';
import { createNodeStayClient } from '../services/nodestay';
import { useUserStore } from '../stores/user.store';
import { useAaTransaction } from './useAaTransaction';
import { encodeRevenueClaim } from '../services/aa/encodeMarketplaceCalls';
import { resolveTxMode } from './txMode';
import { useUserState } from './useUserState';

// ---------------------------------------------------------------------------
// Revenue Right コントラクト設定
// ---------------------------------------------------------------------------

// RevenueRight コントラクトアドレス（環境変数 or フォールバック）
const REVENUE_RIGHT_ADDRESS = (process.env.NEXT_PUBLIC_REVENUE_RIGHT_ADDRESS ?? '') as `0x${string}`;

// claim(programId, allocationId) ABI
const REVENUE_RIGHT_ABI = [
  {
    name: 'claim',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'programId', type: 'uint256' },
      { name: 'allocationId', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

export type RevenueRightStatus = 'ACTIVE' | 'EXPIRED';

export interface RevenueProgram {
  programId: string;
  nodeId: string;         // マシン識別子（machineId）
  machineName: string;
  venueId: string;
  venueName: string;
  settlementCycle: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  startAt: string;        // ISO 日時
  endAt: string;
  status: RevenueRightStatus;
}

export interface RevenueRight {
  id: string;
  programId: string;
  onchainProgramId: string | null;
  program: RevenueProgram;
  /** 保有量（ERC-1155 の amount） */
  holdAmount: number;
  /** プログラム総発行量 */
  totalSupply: number;
  /** 保有割合（%） */
  sharePercent: number;
  status: RevenueRightStatus;
}

export interface Allocation {
  allocationId: string;
  programId: string;
  programName: string;
  periodLabel: string;
  totalAmountMinor: number;
  myAmountMinor: number;
  claimed: boolean;
  claimableUntil: string; // ISO 日時
}

export interface UseRevenueDashboardReturn {
  rights: RevenueRight[];
  allocations: Allocation[];
  /** 未 claim 合計（JPYC minor） */
  unclaimedTotalMinor: number;
  /** 累計受取済み合計（JPYC minor） */
  claimedTotalMinor: number;
  loading: boolean;
  claimingId: string | null;
  claimSuccess: string | null;
  handleClaim: (allocationId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

function toBigInt(v: string | null | undefined, fallback = 0n): bigint {
  if (!v) return fallback;
  try {
    return BigInt(v);
  } catch {
    return fallback;
  }
}

function toSafeNumber(v: bigint): number {
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) return Number.MAX_SAFE_INTEGER;
  if (v < BigInt(Number.MIN_SAFE_INTEGER)) return Number.MIN_SAFE_INTEGER;
  return Number(v);
}

function toRevenueStatus(v: string): RevenueRightStatus {
  return v === 'ACTIVE' ? 'ACTIVE' : 'EXPIRED';
}

function formatPeriodLabel(startAt: string, endAt: string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const s = start.toLocaleDateString('ja-JP');
  const e = end.toLocaleDateString('ja-JP');
  return `${s} - ${e}`;
}

function isConnectorNotConnectedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /connector not connected/i.test(message);
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

// allocationId をキーに { programId, allocationId } を保持する型
interface ClaimTarget {
  onchainProgramId: string;
  onchainAllocationId: string;
  allocationId: string;
  revenueRightId: string;
}

export function useRevenueDashboard(): UseRevenueDashboardReturn {
  const { walletAddress: authWalletAddress, onchainWalletAddress } = useUserState();
  const loginMethod = useUserStore((s) => s.loginMethod);
  const { isConnected } = useAccount();
  const mode = resolveTxMode(loginMethod, isConnected);
  const isAaMode = mode === 'aa';
  const config = useConfig();
  const { writeContractAsync } = useWriteContract();
  const { sendUserOp, error: aaError } = useAaTransaction();

  const [rights, setRights] = useState<RevenueRight[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState<string | null>(null);
  // allocationId → ClaimTarget のマップ（on-chain 呼び出し用）
  const [claimTargets, setClaimTargets] = useState<Record<string, ClaimTarget>>({});

  const loadDashboard = useCallback(async () => {
    if (!authWalletAddress) {
      setRights([]);
      setAllocations([]);
      setClaimTargets({});
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const client = createNodeStayClient();

      const [apiRights, apiClaims] = await Promise.all([
        client.listMyRevenueRights({ walletAddress: authWalletAddress }),
        client.listRevenueClaims({ walletAddress: authWalletAddress }),
      ]);

      const programIds = [...new Set(apiRights.map((r) => r.revenueProgramId))];
      if (programIds.length === 0) {
        setRights([]);
        setAllocations([]);
        setClaimTargets({});
        setLoading(false);
        return;
      }

      const [programDetails, allocationsByProgram] = await Promise.all([
        Promise.all(programIds.map((programId) => client.getRevenueProgram(programId))),
        Promise.all(programIds.map(async (programId) => ({
          programId,
          allocations: await client.listRevenueAllocations(programId),
        }))),
      ]);

      const programDetailMap = new Map(programDetails.map((p) => [p.id, p]));
      const rightAmountMap = new Map<string, bigint>();
      const rightProgramMap = new Map<string, string>();
      const programRightIds = new Map<string, string[]>();
      const programMyUnitSum = new Map<string, bigint>();
      const programOnchainId = new Map<string, string>();

      for (const right of apiRights) {
        const amount = toBigInt(right.amount1155, 1n);
        rightAmountMap.set(right.id, amount);
        rightProgramMap.set(right.id, right.revenueProgramId);
        if (right.onchainProgramId && /^\d+$/.test(right.onchainProgramId)) {
          programOnchainId.set(right.revenueProgramId, right.onchainProgramId);
        } else if (right.onchainTokenId && /^\d+$/.test(right.onchainTokenId)) {
          programOnchainId.set(right.revenueProgramId, right.onchainTokenId);
        }

        const ids = programRightIds.get(right.revenueProgramId) ?? [];
        ids.push(right.id);
        programRightIds.set(right.revenueProgramId, ids);

        const prev = programMyUnitSum.get(right.revenueProgramId) ?? 0n;
        programMyUnitSum.set(right.revenueProgramId, prev + amount);
      }

      const mappedRights: RevenueRight[] = apiRights.map((right) => {
        const detail = programDetailMap.get(right.revenueProgramId);
        const totalSupplyUnits = detail
          ? detail.revenueRights.reduce((sum, rr) => sum + toBigInt(rr.amount1155, 1n), 0n)
          : 1n;
        const total = totalSupplyUnits > 0n ? totalSupplyUnits : 1n;
        const hold = rightAmountMap.get(right.id) ?? 1n;
        const sharePercent = Number((hold * 10000n) / total) / 100;

        const machine = right.revenueProgram.machine;
        const machineName =
          machine.localSerial ??
          machine.gpu ??
          machine.cpu ??
          `Machine ${machine.machineId.slice(0, 8)}`;
        const venueName = machine.venue?.name ?? 'Unknown Venue';

        return {
          id: right.id,
          programId: right.revenueProgramId,
          onchainProgramId: right.onchainProgramId ?? right.onchainTokenId ?? null,
            program: {
              programId: right.revenueProgramId,
              nodeId: machine.machineId,
              machineName,
              venueId: machine.venueId ?? machine.id,
              venueName,
              settlementCycle: (right.revenueProgram.settlementCycle as RevenueProgram['settlementCycle']) ?? 'MONTHLY',
              startAt: right.revenueProgram.startAt,
              endAt: right.revenueProgram.endAt,
            status: toRevenueStatus(right.revenueProgram.status),
          },
          holdAmount: toSafeNumber(hold),
          totalSupply: toSafeNumber(total),
          sharePercent: Number.isFinite(sharePercent) ? sharePercent : 0,
          status: toRevenueStatus(right.status),
        };
      });

      const claimKeySet = new Set(apiClaims.map((c) => `${c.revenueRightId}:${c.allocationId}`));
      // on-chain claim 用のターゲットマップ（allocationId → { programId, allocationId }）
      const claimTargetsNext: Record<string, ClaimTarget> = {};
      const mappedAllocations: Allocation[] = [];

      for (const { programId, allocations: allocs } of allocationsByProgram) {
        const detail = programDetailMap.get(programId);
        const totalSupplyUnits = detail
          ? detail.revenueRights.reduce((sum, rr) => sum + toBigInt(rr.amount1155, 1n), 0n)
          : 1n;
        const total = totalSupplyUnits > 0n ? totalSupplyUnits : 1n;
        const myUnits = programMyUnitSum.get(programId) ?? 0n;
        const rightIds = programRightIds.get(programId) ?? [];

        const programName =
          mappedRights.find((r) => r.programId === programId)?.program.machineName ?? `Program ${programId.slice(0, 8)}`;

        for (const alloc of allocs) {
          const unclaimedRightIds = rightIds.filter((rid) => !claimKeySet.has(`${rid}:${alloc.id}`));
          const selectedRightId = unclaimedRightIds[0];
          const onchainProgramId = programOnchainId.get(programId);
          const onchainAllocationId = alloc.onchainAllocationId;
          if (
            selectedRightId &&
            onchainProgramId &&
            onchainAllocationId &&
            /^\d+$/.test(onchainAllocationId)
          ) {
            claimTargetsNext[alloc.id] = {
              onchainProgramId,
              onchainAllocationId,
              allocationId: alloc.id,
              revenueRightId: selectedRightId,
            };
          }

          const totalAmount = toBigInt(alloc.totalAmountJpyc, 0n);
          const myAmount = (totalAmount * myUnits) / total;

          mappedAllocations.push({
            allocationId: alloc.id,
            programId,
            programName,
            periodLabel: formatPeriodLabel(alloc.allocationPeriodStart, alloc.allocationPeriodEnd),
            totalAmountMinor: toSafeNumber(totalAmount),
            myAmountMinor: toSafeNumber(myAmount),
            claimed: rightIds.length > 0 && unclaimedRightIds.length === 0,
            claimableUntil: alloc.allocationPeriodEnd,
          });
        }
      }

      mappedAllocations.sort((a, b) => b.claimableUntil.localeCompare(a.claimableUntil));

      setRights(mappedRights);
      setAllocations(mappedAllocations);
      setClaimTargets(claimTargetsNext);
    } catch {
      setRights([]);
      setAllocations([]);
      setClaimTargets({});
    } finally {
      setLoading(false);
    }
  }, [authWalletAddress]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const unclaimedTotalMinor = useMemo(
    () => allocations.filter((a) => !a.claimed).reduce((sum, a) => sum + a.myAmountMinor, 0),
    [allocations],
  );

  const claimedTotalMinor = useMemo(
    () => allocations.filter((a) => a.claimed).reduce((sum, a) => sum + a.myAmountMinor, 0),
    [allocations],
  );

  const handleClaim = useCallback(async (allocationId: string) => {
    if (!authWalletAddress) return;

    const target = claimTargets[allocationId];
    if (!target) return;

    setClaimingId(allocationId);
    setClaimSuccess(null);

    try {
      if (!REVENUE_RIGHT_ADDRESS || !REVENUE_RIGHT_ADDRESS.startsWith('0x')) return;

      let txHash: `0x${string}`;
      const sendViaAa = async () => {
        const result = await sendUserOp([
          {
            to: REVENUE_RIGHT_ADDRESS,
            data: encodeRevenueClaim(BigInt(target.onchainProgramId), BigInt(target.onchainAllocationId)),
            value: 0n,
          },
        ]);
        if (!result?.txHash) {
          throw new Error(aaError ?? 'AA での claim トランザクション送信に失敗しました');
        }
        return result.txHash;
      };

      if (isAaMode) {
        txHash = await sendViaAa();
      } else {
        try {
          // コントラクトの claim(programId, allocationId) を直接呼び出す（on-chain）
          txHash = await writeContractAsync({
            address: REVENUE_RIGHT_ADDRESS,
            abi: REVENUE_RIGHT_ABI,
            functionName: 'claim',
            args: [BigInt(target.onchainProgramId), BigInt(target.onchainAllocationId)],
          });
          await waitForTransactionReceipt(config, { hash: txHash });
        } catch (walletError) {
          if (loginMethod !== 'wallet' && isConnectorNotConnectedError(walletError)) {
            txHash = await sendViaAa();
          } else {
            throw walletError;
          }
        }
      }

      const client = createNodeStayClient();
      await client.claimRevenue({
        revenueRightId: target.revenueRightId,
        allocationId: target.allocationId,
        walletAddress: onchainWalletAddress ?? undefined,
        onchainTxHash: txHash,
      });

      // claim 成功後にダッシュボードを再取得して状態を同期する
      await loadDashboard();
      setClaimSuccess(allocationId);
      setTimeout(() => setClaimSuccess(null), 3000);
    } catch (e: unknown) {
      // ユーザーがウォレット操作をキャンセルした場合はエラー表示しない
      const message = e instanceof Error ? e.message : '';
      if (!message.includes('User rejected')) {
        // エラーはコンソールに記録し、UI は loading 解除のみで対応する
        console.error('claim エラー:', message);
      }
    } finally {
      setClaimingId(null);
    }
  }, [authWalletAddress, onchainWalletAddress, claimTargets, isAaMode, sendUserOp, aaError, writeContractAsync, loadDashboard, config]);

  return {
    rights,
    allocations,
    unclaimedTotalMinor,
    claimedTotalMinor,
    loading,
    claimingId,
    claimSuccess,
    handleClaim,
    refresh: loadDashboard,
  };
}
