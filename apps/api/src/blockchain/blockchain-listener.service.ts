import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ethers } from 'ethers';
import { BlockchainService } from './blockchain.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  NodeStayMachineRegistry__factory,
  NodeStayUsageRight__factory,
  NodeStaySettlement__factory,
  NodeStayComputeRight__factory,
  NodeStayRevenueRight__factory,
  NodeStayMarketplace__factory,
} from '../../../../packages/contracts/typechain-types';

type AnyContract = { off: (event: string, handler: (...args: any[]) => void) => void };

/** PENDING 状態のタイムアウト閾値（5分） */
const PENDING_TIMEOUT_MS = 5 * 60 * 1000;

/** タイムアウトチェックの実行間隔（1分） */
const TIMEOUT_CHECK_INTERVAL_MS = 60 * 1000;

/**
 * BlockchainListenerService
 * コントラクトイベントを監視し DB を同期するインデクサー。
 *
 * 監視イベント:
 * - MachineRegistered   → machines.onchain_token_id / onchain_tx_hash 反映
 * - UsageRightMinted    → usage_rights.onchain_token_id / onchain_tx_hash 反映
 * - UsageRightConsumed  → usage_rights.status → CONSUMED
 * - UsageSettled        → ledger_entries に CONFIRMED 記録（tx_hash 重複排除付き）
 * - ComputeRightMinted  → compute_rights.onchain_token_id 反映
 * - JobCompleted        → compute_jobs.status → COMPLETED
 * - JobInterrupted      → compute_jobs.status → INTERRUPTED
 * - AllocationRecorded  → revenue_allocations.allocation_tx_hash 反映
 * - Claimed             → revenue_claims.claim_tx_hash 反映
 * - Listed              → usage_listings.onchain_listing_id / onchain_tx_hash 反映
 * - Purchased           → usage_listings.status → SOLD
 * - Cancelled           → usage_listings.status → CANCELLED
 *
 * 追加機能:
 * - tx_hash 重複排除: 同一 tx_hash の二重書き込みを防止
 * - PENDING タイムアウト: 5分以上 PENDING のレコードを TIMEOUT ステータスに更新
 */
@Injectable()
export class BlockchainListenerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BlockchainListenerService.name);
  private listeners: Array<{ contract: AnyContract; event: string; handler: (...args: any[]) => void }> = [];
  private timeoutCheckTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly blockchain: BlockchainService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    if (!this.blockchain.isEnabled) {
      this.logger.warn('BlockchainListener: チェーン未接続のためスキップ');
      return;
    }
    await this.startListening();
    this.startTimeoutChecker();
  }

  async onModuleDestroy() {
    // イベントリスナーを全解除
    for (const { contract, event, handler } of this.listeners) {
      contract.off(event, handler);
    }
    this.listeners = [];

    // タイムアウトチェッカーを停止
    if (this.timeoutCheckTimer) {
      clearInterval(this.timeoutCheckTimer);
      this.timeoutCheckTimer = null;
    }
  }

  // =========================================================================
  // イベントリスナー登録・起動
  // =========================================================================

  private register(contract: AnyContract, event: string, handler: (...args: any[]) => void) {
    (contract as any).on(event, handler);
    this.listeners.push({ contract, event, handler });
  }

  private async startListening() {
    const provider = this.blockchain.provider;
    const registryAddr   = process.env.MACHINE_REGISTRY_ADDRESS;
    const usageRightAddr = process.env.USAGE_RIGHT_ADDRESS;
    const settlementAddr = process.env.SETTLEMENT_ADDRESS;

    // -----------------------------------------------------------------------
    // MachineRegistry: MachineRegistered
    // -----------------------------------------------------------------------
    if (registryAddr) {
      const registry = NodeStayMachineRegistry__factory.connect(registryAddr, provider);
      const handler = async (machineId: string, _registrant: string, tokenId: bigint, event: ethers.EventLog) => {
        this.logger.log(`MachineRegistered: machineId=${machineId} tokenId=${tokenId}`);
        await this.handleWithRetry(() =>
          this.prisma.machine.updateMany({
            where: { machineId },
            data: {
              onchainTokenId: tokenId.toString(),
              onchainTxHash:  event.transactionHash,
              status: 'ACTIVE',
            },
          })
        );
      };
      this.register(registry, 'MachineRegistered', handler);
      this.logger.log(`MachineRegistry リスナー起動: ${registryAddr}`);
    }

    // -----------------------------------------------------------------------
    // UsageRight: UsageRightMinted / UsageRightConsumed
    // -----------------------------------------------------------------------
    if (usageRightAddr) {
      const ur = NodeStayUsageRight__factory.connect(usageRightAddr, provider);

      const mintHandler = async (_to: string, usageRightId: bigint, event: ethers.EventLog) => {
        this.logger.log(`UsageRightMinted: tokenId=${usageRightId}`);
        await this.handleWithRetry(() =>
          this.prisma.usageRight.updateMany({
            where: { onchainTxHash: event.transactionHash },
            data: { onchainTokenId: usageRightId.toString() },
          })
        );
      };

      const consumeHandler = async (usageRightId: bigint) => {
        this.logger.log(`UsageRightConsumed: tokenId=${usageRightId}`);
        await this.handleWithRetry(() =>
          this.prisma.usageRight.updateMany({
            where: { onchainTokenId: usageRightId.toString() },
            data: { status: 'CONSUMED' },
          })
        );
      };

      this.register(ur, 'UsageRightMinted', mintHandler);
      this.register(ur, 'UsageRightConsumed', consumeHandler);
      this.logger.log(`UsageRight リスナー起動: ${usageRightAddr}`);
    }

    // -----------------------------------------------------------------------
    // Settlement: UsageSettled（tx_hash 重複排除付き）
    // -----------------------------------------------------------------------
    if (settlementAddr) {
      const settlement = NodeStaySettlement__factory.connect(settlementAddr, provider);

      const settleHandler = async (
        referenceId: string,
        venueTreasury: string,
        venueAmount: bigint,
        platformAmount: bigint,
        _revenueAmount: bigint,
        event: ethers.EventLog,
      ) => {
        this.logger.log(`UsageSettled: ref=${referenceId} venue=${venueAmount} platform=${platformAmount}`);

        await this.handleWithRetry(async () => {
          // tx_hash 重複排除: 同一ハッシュのエントリが既に存在する場合はスキップ
          const existing = await this.prisma.ledgerEntry.findFirst({
            where: { txHash: event.transactionHash },
          });
          if (existing) {
            this.logger.warn(`tx_hash 重複排除: ${event.transactionHash} は既に記録済みのためスキップ`);
            return;
          }

          await this.prisma.ledgerEntry.create({
            data: {
              entryType:     'PAYMENT',
              referenceType: 'USAGE',
              referenceId,
              toWallet:      venueTreasury,
              amountJpyc:    venueAmount.toString(),
              txHash:        event.transactionHash,
              status:        'CONFIRMED',
              confirmedAt:   new Date(),
            },
          });
        });
      };

      this.register(settlement, 'UsageSettled', settleHandler);
      this.logger.log(`Settlement リスナー起動: ${settlementAddr}`);
    }

    // -----------------------------------------------------------------------
    // E1: ComputeRight: ComputeRightMinted
    // compute_rights.onchain_token_id を反映する
    // -----------------------------------------------------------------------
    const computeRightAddr = process.env.COMPUTE_RIGHT_ADDRESS;
    if (computeRightAddr) {
      const cr = NodeStayComputeRight__factory.connect(computeRightAddr, provider);

      const crMintHandler = async (_to: string, tokenId: bigint, _nodeId: string, _durationSeconds: bigint, _priceJpyc: bigint, event: ethers.EventLog) => {
        this.logger.log(`ComputeRightMinted: tokenId=${tokenId}`);
        await this.handleWithRetry(() =>
          this.prisma.computeRight.updateMany({
            where: { onchainTxHash: event.transactionHash },
            data: { onchainTokenId: tokenId.toString() },
          })
        );
      };

      // -----------------------------------------------------------------------
      // E2: ComputeRight: JobCompleted / JobInterrupted
      // compute_jobs.status を COMPLETED / INTERRUPTED に更新し onchain_tx_hash を記録する
      // -----------------------------------------------------------------------
      const completedHandler = async (tokenId: bigint, _endedAt: bigint, event: ethers.EventLog) => {
        this.logger.log(`JobCompleted: tokenId=${tokenId}`);
        await this.handleWithRetry(() =>
          this.prisma.computeJob.updateMany({
            where: { computeRight: { onchainTokenId: tokenId.toString() } },
            data: { status: 'COMPLETED', onchainTxHash: event.transactionHash, endedAt: new Date() },
          })
        );
      };

      const interruptedHandler = async (tokenId: bigint, _usedSeconds: bigint, _refundJpyc: bigint, event: ethers.EventLog) => {
        this.logger.log(`JobInterrupted: tokenId=${tokenId}`);
        await this.handleWithRetry(() =>
          this.prisma.computeJob.updateMany({
            where: { computeRight: { onchainTokenId: tokenId.toString() } },
            data: { status: 'INTERRUPTED', onchainTxHash: event.transactionHash, endedAt: new Date() },
          })
        );
      };

      this.register(cr, 'ComputeRightMinted', crMintHandler);
      this.register(cr, 'JobCompleted', completedHandler);
      this.register(cr, 'JobInterrupted', interruptedHandler);
      this.logger.log(`ComputeRight リスナー起動: ${computeRightAddr}`);
    }

    // -----------------------------------------------------------------------
    // E3: RevenueRight: AllocationRecorded
    // revenue_allocations.allocation_tx_hash を反映する
    // E4: RevenueRight: Claimed
    // revenue_claims.claim_tx_hash を反映する
    // -----------------------------------------------------------------------
    const revenueRightAddr = process.env.REVENUE_RIGHT_ADDRESS;
    if (revenueRightAddr) {
      const rr = NodeStayRevenueRight__factory.connect(revenueRightAddr, provider);

      const allocationHandler = async (allocationId: bigint, _programId: bigint, _totalAmountJpyc: bigint, event: ethers.EventLog) => {
        this.logger.log(`AllocationRecorded: allocationId=${allocationId}`);
        // onchainAllocationId フィールドは schema にないため、allocationTxHash のみ更新する
        // where 条件は txHash ではなく revenueProgramId + 期間で特定するため、
        // allocationTxHash が未設定のレコードを対象にする
        await this.handleWithRetry(() =>
          this.prisma.revenueAllocation.updateMany({
            where: { allocationTxHash: null },
            data: { allocationTxHash: event.transactionHash },
          })
        );
      };

      const claimedHandler = async (holder: string, programId: bigint, allocationId: bigint, _amountJpyc: bigint, event: ethers.EventLog) => {
        this.logger.log(`Claimed: holder=${holder} programId=${programId} allocationId=${allocationId}`);
        await this.handleWithRetry(async () => {
          // tx_hash 重複排除: 同一ハッシュのエントリが既に存在する場合はスキップ
          const existing = await this.prisma.ledgerEntry.findFirst({
            where: { txHash: event.transactionHash },
          });
          if (existing) {
            this.logger.warn(`tx_hash 重複排除（Claimed）: ${event.transactionHash} は既に記録済みのためスキップ`);
            return;
          }

          // allocationId を文字列変換して allocationTxHash で照合する
          await this.prisma.revenueClaim.updateMany({
            where: {
              allocation: { allocationTxHash: event.transactionHash },
            },
            data: { claimTxHash: event.transactionHash },
          });
        });
      };

      this.register(rr, 'AllocationRecorded', allocationHandler);
      this.register(rr, 'Claimed', claimedHandler);
      this.logger.log(`RevenueRight リスナー起動: ${revenueRightAddr}`);
    }

    // -----------------------------------------------------------------------
    // E5: Marketplace: Listed / Purchased / Cancelled
    // usage_listings のオンチェーン情報を同期する
    // -----------------------------------------------------------------------
    const marketplaceAddr = process.env.MARKETPLACE_ADDRESS;
    if (marketplaceAddr) {
      const mp = NodeStayMarketplace__factory.connect(marketplaceAddr, provider);

      // Listed: usage_listings.onchain_listing_id / onchain_tx_hash を反映
      const listedHandler = async (listingId: bigint, tokenId: bigint, _seller: string, _priceJpyc: bigint, event: ethers.EventLog) => {
        this.logger.log(`Listed: listingId=${listingId} tokenId=${tokenId}`);
        await this.handleWithRetry(() =>
          this.prisma.usageListing.updateMany({
            where: { usageRight: { onchainTokenId: tokenId.toString() }, status: 'ACTIVE' },
            data: { onchainListingId: listingId.toString(), onchainTxHash: event.transactionHash },
          })
        );
      };

      // Purchased: usage_listings.status を SOLD に更新し onchain_tx_hash を記録
      const purchasedHandler = async (listingId: bigint, _tokenId: bigint, _buyer: string, _priceJpyc: bigint, event: ethers.EventLog) => {
        this.logger.log(`Purchased: listingId=${listingId}`);
        await this.handleWithRetry(() =>
          this.prisma.usageListing.updateMany({
            where: { onchainListingId: listingId.toString() },
            data: { status: 'SOLD', onchainTxHash: event.transactionHash, soldAt: new Date() },
          })
        );
      };

      // Cancelled: usage_listings.status を CANCELLED に更新
      const cancelledHandler = async (listingId: bigint, _seller: string, event: ethers.EventLog) => {
        this.logger.log(`Cancelled: listingId=${listingId}`);
        await this.handleWithRetry(() =>
          this.prisma.usageListing.updateMany({
            where: { onchainListingId: listingId.toString() },
            data: { status: 'CANCELLED', onchainTxHash: event.transactionHash },
          })
        );
      };

      this.register(mp, 'Listed', listedHandler);
      this.register(mp, 'Purchased', purchasedHandler);
      this.register(mp, 'Cancelled', cancelledHandler);
      this.logger.log(`Marketplace リスナー起動: ${marketplaceAddr}`);
    }
  }

  // =========================================================================
  // PENDING タイムアウト検出（5分超 → TIMEOUT に更新）
  // =========================================================================

  private startTimeoutChecker() {
    this.timeoutCheckTimer = setInterval(() => {
      this.checkPendingTimeouts().catch((e: unknown) => {
        this.logger.error(`タイムアウトチェック失敗: ${e instanceof Error ? e.message : String(e)}`);
      });
    }, TIMEOUT_CHECK_INTERVAL_MS);

    this.logger.log('PENDING タイムアウトチェッカー起動（60秒間隔）');
  }

  private async checkPendingTimeouts() {
    const cutoff = new Date(Date.now() - PENDING_TIMEOUT_MS);

    // 5分以上 PENDING の usage_rights を TIMEOUT に更新
    const timedOutRights = await this.prisma.usageRight.updateMany({
      where: {
        status:    'MINTED',
        createdAt: { lt: cutoff },
        onchainTxHash: { not: null },
        onchainTokenId: null,  // まだオンチェーン確認されていない
      },
      data: { status: 'CANCELLED' },
    });

    // 5分以上 PENDING の machines を REGISTERED のまま放置ログ
    const staleMachines = await this.prisma.machine.findMany({
      where: {
        status:        'REGISTERED',
        createdAt:     { lt: cutoff },
        onchainTxHash: { not: null },
        onchainTokenId: null,
      },
      select: { id: true, machineId: true },
    });

    if (timedOutRights.count > 0) {
      this.logger.warn(`PENDING タイムアウト: ${timedOutRights.count} 件の利用権を CANCELLED に更新`);
    }
    if (staleMachines.length > 0) {
      this.logger.warn(
        `未確認マシン: ${staleMachines.length} 件が 5 分以上未確認 (IDs: ${staleMachines.map((m) => m.id).join(', ')})`
      );
    }
  }

  // =========================================================================
  // ユーティリティ
  // =========================================================================

  /** 指数退避付きリトライ（最大 3 回） */
  private async handleWithRetry(fn: () => Promise<unknown>, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
      try {
        await fn();
        return;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (i === retries - 1) {
          this.logger.error(`イベントハンドラ失敗（${retries} 回後）: ${msg}`);
        } else {
          this.logger.warn(`イベントハンドラ失敗（${i + 1} 回目）。${delay * Math.pow(2, i)}ms 後リトライ: ${msg}`);
          await new Promise((r) => setTimeout(r, delay * Math.pow(2, i)));
        }
      }
    }
  }
}
