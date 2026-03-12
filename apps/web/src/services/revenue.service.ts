/**
 * RevenueService:
 * - ダッシュボードデータを取得し revenue.store に反映する
 * - claim の状態遷移（submitting -> pending -> finalized/failed）を管理する
 * - クラス内で client を保持し、毎回 createNodeStayClient() しない
 */

import type { NodeStayClient } from '@nodestay/api-client';
import { createNodeStayClient } from './nodestay';
import { FormatService } from './format.service';
import { getRevenueStore } from '../stores/revenue.store';
import type {
  Allocation,
  ClaimTarget,
  RevenueProgram,
  RevenueRight,
} from '../models/revenue.model';

const DEFAULT_POLL_INTERVAL_MS = 3000;
const DEFAULT_MAX_WAIT_MS = 60000;

class RevenueServiceClass {
  private _client: NodeStayClient | null = null;

  private get client(): NodeStayClient {
    if (!this._client) this._client = createNodeStayClient();
    return this._client;
  }

  async loadDashboard(walletAddress: string | null | undefined): Promise<void> {
    const store = getRevenueStore();
    if (!walletAddress) {
      store.reset();
      return;
    }

    store.setLoading(true);
    store.setError(null);

    try {
      const [apiRights, apiClaims] = await Promise.all([
        this.client.listMyRevenueRights({ walletAddress }),
        this.client.listRevenueClaims({ walletAddress }),
      ]);

      const programIds = [...new Set(apiRights.map((r) => r.revenueProgramId))];
      if (programIds.length === 0) {
        store.setDashboardData([], [], {});
        return;
      }

      const [programDetails, allocationsByProgram] = await Promise.all([
        Promise.all(programIds.map((programId) => this.client.getRevenueProgram(programId))),
        Promise.all(
          programIds.map(async (programId) => ({
            programId,
            allocations: await this.client.listRevenueAllocations(programId),
          }))
        ),
      ]);

      const programDetailMap = new Map(programDetails.map((p) => [p.id, p]));
      const rightAmountMap = new Map<string, bigint>();
      const programRightIds = new Map<string, string[]>();
      const programMyUnitSum = new Map<string, bigint>();

      for (const right of apiRights) {
        const amount = FormatService.toBigInt(right.amount1155, 1n);
        rightAmountMap.set(right.id, amount);

        const ids = programRightIds.get(right.revenueProgramId) ?? [];
        ids.push(right.id);
        programRightIds.set(right.revenueProgramId, ids);

        const prev = programMyUnitSum.get(right.revenueProgramId) ?? 0n;
        programMyUnitSum.set(right.revenueProgramId, prev + amount);
      }

      const mappedRights: RevenueRight[] = apiRights.map((right) => {
        const detail = programDetailMap.get(right.revenueProgramId);
        const totalSupplyUnits = detail
          ? detail.revenueRights.reduce((sum, rr) => sum + FormatService.toBigInt(rr.amount1155, 1n), 0n)
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

        const program: RevenueProgram = {
          programId: right.revenueProgramId,
          nodeId: machine.machineId,
          machineName,
          venueId: machine.venueId ?? machine.id,
          venueName,
          settlementCycle:
            (right.revenueProgram.settlementCycle as RevenueProgram['settlementCycle']) ?? 'MONTHLY',
          startAt: right.revenueProgram.startAt,
          endAt: right.revenueProgram.endAt,
          status: FormatService.toRevenueStatus(right.revenueProgram.status),
        };

        return {
          id: right.id,
          programId: right.revenueProgramId,
          program,
          holdAmount: FormatService.toSafeNumber(hold),
          totalSupply: FormatService.toSafeNumber(total),
          sharePercent: Number.isFinite(sharePercent) ? sharePercent : 0,
          status: FormatService.toRevenueStatus(right.status),
        };
      });

      const claimKeySet = new Set(
        apiClaims.map((c) => `${c.revenueRightId}:${c.allocationId}`)
      );
      const claimTargetsNext: Record<string, ClaimTarget> = {};
      const mappedAllocations: Allocation[] = [];

      for (const { programId, allocations: allocs } of allocationsByProgram) {
        const detail = programDetailMap.get(programId);
        const totalSupplyUnits = detail
          ? detail.revenueRights.reduce((sum, rr) => sum + FormatService.toBigInt(rr.amount1155, 1n), 0n)
          : 1n;
        const total = totalSupplyUnits > 0n ? totalSupplyUnits : 1n;
        const myUnits = programMyUnitSum.get(programId) ?? 0n;
        const rightIds = programRightIds.get(programId) ?? [];

        const programName =
          mappedRights.find((r) => r.programId === programId)?.program.machineName ??
          `Program ${programId.slice(0, 8)}`;

        for (const alloc of allocs) {
          const unclaimedRightIds = rightIds.filter(
            (rid) => !claimKeySet.has(`${rid}:${alloc.id}`)
          );
          const selectedRightId = unclaimedRightIds[0];
          if (selectedRightId) {
            claimTargetsNext[alloc.id] = {
              programId,
              allocationId: alloc.id,
              revenueRightId: selectedRightId,
            };
          }

          const totalAmount = FormatService.toBigInt(alloc.totalAmountJpyc, 0n);
          const myAmount = (totalAmount * myUnits) / total;

          mappedAllocations.push({
            allocationId: alloc.id,
            programId,
            programName,
            periodLabel: FormatService.formatPeriodLabel(
              alloc.allocationPeriodStart,
              alloc.allocationPeriodEnd
            ),
            totalAmountMinor: FormatService.toSafeNumber(totalAmount),
            myAmountMinor: FormatService.toSafeNumber(myAmount),
            claimed: rightIds.length > 0 && unclaimedRightIds.length === 0,
            claimableUntil: alloc.allocationPeriodEnd,
          });
        }
      }

      mappedAllocations.sort((a, b) =>
        b.claimableUntil.localeCompare(a.claimableUntil)
      );
      store.setDashboardData(mappedRights, mappedAllocations, claimTargetsNext);
    } catch (e) {
      store.setDashboardData([], [], {});
      store.setError(e instanceof Error ? e.message : 'Failed to load revenue dashboard');
    } finally {
      store.setLoading(false);
    }
  }

  beginClaim(allocationId: string): void {
    const store = getRevenueStore();
    store.setClaimingId(allocationId);
    store.setClaimStatus(allocationId, 'submitting');
    store.setClaimError(allocationId, null);
  }

  markClaimPending(allocationId: string, txHash: string | null): void {
    const store = getRevenueStore();
    store.setClaimStatus(allocationId, 'pending');
    store.setClaimTxHash(allocationId, txHash);
    store.setClaimError(allocationId, null);
  }

  markClaimFinalized(allocationId: string, txHash?: string | null): void {
    const store = getRevenueStore();
    store.setClaimingId(allocationId);
    store.setClaimStatus(allocationId, 'finalized');
    if (typeof txHash !== 'undefined') {
      store.setClaimTxHash(allocationId, txHash);
    }
    store.setClaimError(allocationId, null);
  }

  markClaimFailed(allocationId: string, error: string): void {
    const store = getRevenueStore();
    store.setClaimingId(allocationId);
    store.setClaimStatus(allocationId, 'failed');
    store.setClaimError(allocationId, error);
  }

  clearClaiming(allocationId: string): void {
    const store = getRevenueStore();
    store.setClaimingId(null);
    store.setClaimStatus(allocationId, 'idle');
    store.setClaimError(allocationId, null);
  }

  async createClaimRecord(params: {
    revenueRightId: string;
    allocationId: string;
    walletAddress: string;
  }): Promise<void> {
    try {
      await this.client.claimRevenue({
        revenueRightId: params.revenueRightId,
        allocationId: params.allocationId,
        walletAddress: params.walletAddress,
      });
    } catch (e) {
      // 409(既にクレーム済み) は終局監視に進めるため許容
      const message = e instanceof Error ? e.message : '';
      if (message.includes('409') || message.includes('既にクレーム済み')) {
        return;
      }
      throw e;
    }
  }

  async waitForClaimFinalization(params: {
    walletAddress: string;
    allocationId: string;
    revenueRightId: string;
    submittedTxHash: string;
    maxWaitMs?: number;
    pollIntervalMs?: number;
  }): Promise<{ finalized: boolean; claimTxHash: string | null }> {
    const maxWaitMs = params.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
    const pollIntervalMs = params.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const startedAt = Date.now();

    this.markClaimPending(params.allocationId, params.submittedTxHash);

    while (Date.now() - startedAt < maxWaitMs) {
      const claims = await this.client.listRevenueClaims({
        walletAddress: params.walletAddress,
      });

      const match = claims.find(
        (c) =>
          c.allocationId === params.allocationId &&
          c.revenueRightId === params.revenueRightId
      );
      if (match) {
        const claimTxHash =
          (match as { claimTxHash?: string | null }).claimTxHash ?? null;
        if (claimTxHash) {
          this.markClaimFinalized(params.allocationId, claimTxHash);
          return { finalized: true, claimTxHash };
        }
      }

      await FormatService.sleep(pollIntervalMs);
    }

    return { finalized: false, claimTxHash: params.submittedTxHash };
  }
}

export const RevenueService = new RevenueServiceClass();
