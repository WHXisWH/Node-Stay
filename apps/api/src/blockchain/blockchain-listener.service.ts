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

/** PENDING 状態のタイムアウト閾値（5分） */
const PENDING_TIMEOUT_MS = 5 * 60 * 1000;
/** タイムアウトチェックの実行間隔（1分） */
const TIMEOUT_CHECK_INTERVAL_MS = 60 * 1000;

/** リスナーのブロック同期設定 */
const LISTENER_CONFIRMATIONS = 1;
const LISTENER_BATCH_BLOCKS = 200;
const LISTENER_FALLBACK_LOOKBACK_BLOCKS = 2000;
const LISTENER_CURSOR_KEY = 'system:blockchain-listener:cursor:v1';

interface ContractAddresses {
  machineRegistry?: string;
  usageRight?: string;
  settlement?: string;
  computeRight?: string;
  revenueRight?: string;
  marketplace?: string;
}

@Injectable()
export class BlockchainListenerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BlockchainListenerService.name);

  private timeoutCheckTimer: ReturnType<typeof setInterval> | null = null;
  private blockListener: ((blockNumber: number) => void) | null = null;

  private syncInFlight = false;
  private latestObservedBlock = 0;
  private cursorBlock = 0;

  private readonly machineRegistryIface = NodeStayMachineRegistry__factory.createInterface();
  private readonly usageRightIface = NodeStayUsageRight__factory.createInterface();
  private readonly settlementIface = NodeStaySettlement__factory.createInterface();
  private readonly computeRightIface = NodeStayComputeRight__factory.createInterface();
  private readonly revenueRightIface = NodeStayRevenueRight__factory.createInterface();
  private readonly marketplaceIface = NodeStayMarketplace__factory.createInterface();

  constructor(
    private readonly blockchain: BlockchainService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    if (!this.blockchain.isEnabled) {
      this.logger.warn('BlockchainListener: チェーン未接続のためスキップ');
      return;
    }

    await this.initializeCursor();
    await this.syncNewBlocks();
    this.startBlockSubscription();
    this.startTimeoutChecker();
  }

  async onModuleDestroy() {
    if (this.blockListener) {
      if (this.blockchain.isEnabled) {
        this.blockchain.provider.off('block', this.blockListener);
      }
      this.blockListener = null;
    }

    if (this.timeoutCheckTimer) {
      clearInterval(this.timeoutCheckTimer);
      this.timeoutCheckTimer = null;
    }
  }

  // =========================================================================
  // ブロック同期（filter 非依存）
  // =========================================================================

  private startBlockSubscription() {
    this.blockListener = (blockNumber: number) => {
      this.latestObservedBlock = Math.max(this.latestObservedBlock, Number(blockNumber));
      void this.syncNewBlocks();
    };
    this.blockchain.provider.on('block', this.blockListener);
    this.logger.log('BlockchainListener: ブロック購読を開始しました');
  }

  private async initializeCursor() {
    const latest = await this.blockchain.provider.getBlockNumber();
    this.latestObservedBlock = latest;

    const storedCursor = await this.readCursor();
    if (storedCursor === null) {
      this.cursorBlock = Math.max(0, latest - LISTENER_FALLBACK_LOOKBACK_BLOCKS);
      this.logger.log(
        `BlockchainListener: カーソル未登録のため ${this.cursorBlock} から再同期します`,
      );
      return;
    }

    this.cursorBlock = Math.min(storedCursor, latest);
    this.logger.log(`BlockchainListener: 保存済みカーソル ${this.cursorBlock} から再開します`);
  }

  private async syncNewBlocks() {
    if (this.syncInFlight) return;
    this.syncInFlight = true;

    try {
      const latest = await this.blockchain.provider.getBlockNumber();
      this.latestObservedBlock = Math.max(this.latestObservedBlock, latest);

      while (true) {
        const target = Math.max(0, this.latestObservedBlock - LISTENER_CONFIRMATIONS);
        if (target <= this.cursorBlock) break;

        const fromBlock = this.cursorBlock + 1;
        const toBlock = Math.min(fromBlock + LISTENER_BATCH_BLOCKS - 1, target);

        await this.processRange(fromBlock, toBlock);
        this.cursorBlock = toBlock;
        await this.saveCursor(toBlock);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`BlockchainListener: ブロック同期に失敗しました: ${msg}`);
    } finally {
      this.syncInFlight = false;
    }
  }

  private resolveContractAddresses(): ContractAddresses {
    const normalize = (label: string, value: string | undefined): string | undefined => {
      const trimmed = value?.trim();
      if (!trimmed) return undefined;
      if (!ethers.isAddress(trimmed)) {
        this.logger.warn(`${label} のアドレス形式が不正なため監視をスキップします: ${trimmed}`);
        return undefined;
      }
      return ethers.getAddress(trimmed);
    };

    return {
      machineRegistry: normalize('MACHINE_REGISTRY_ADDRESS', process.env.MACHINE_REGISTRY_ADDRESS),
      usageRight: normalize('USAGE_RIGHT_ADDRESS', process.env.USAGE_RIGHT_ADDRESS),
      settlement: normalize('SETTLEMENT_ADDRESS', process.env.SETTLEMENT_ADDRESS),
      computeRight: normalize('COMPUTE_RIGHT_ADDRESS', process.env.COMPUTE_RIGHT_ADDRESS),
      revenueRight: normalize('REVENUE_RIGHT_ADDRESS', process.env.REVENUE_RIGHT_ADDRESS),
      marketplace: normalize('MARKETPLACE_ADDRESS', process.env.MARKETPLACE_ADDRESS),
    };
  }

  private async processRange(fromBlock: number, toBlock: number) {
    if (toBlock < fromBlock) return;

    const addresses = this.resolveContractAddresses();
    const jobs: Promise<void>[] = [];

    if (addresses.machineRegistry) {
      jobs.push(this.processMachineRegistryEvents(addresses.machineRegistry, fromBlock, toBlock));
    }
    if (addresses.usageRight) {
      jobs.push(this.processUsageRightEvents(addresses.usageRight, fromBlock, toBlock));
    }
    if (addresses.settlement) {
      jobs.push(this.processSettlementEvents(addresses.settlement, fromBlock, toBlock));
    }
    if (addresses.computeRight) {
      jobs.push(this.processComputeRightEvents(addresses.computeRight, fromBlock, toBlock));
    }
    if (addresses.revenueRight) {
      jobs.push(this.processRevenueRightEvents(addresses.revenueRight, fromBlock, toBlock));
    }
    if (addresses.marketplace) {
      jobs.push(this.processMarketplaceEvents(addresses.marketplace, fromBlock, toBlock));
    }

    await Promise.all(jobs);
  }

  // =========================================================================
  // イベント処理（コントラクト別）
  // =========================================================================

  private async processMachineRegistryEvents(address: string, fromBlock: number, toBlock: number) {
    const topic = this.machineRegistryIface.getEvent('MachineRegistered').topicHash;
    const logs = await this.blockchain.provider.getLogs({
      address,
      topics: [topic],
      fromBlock,
      toBlock,
    });

    for (const log of logs) {
      const parsed = this.machineRegistryIface.parseLog(log);
      if (!parsed || parsed.name !== 'MachineRegistered') continue;

      const machineId = String(parsed.args.machineId ?? parsed.args[0]);
      const tokenId = this.toBigInt(parsed.args.tokenId ?? parsed.args[2]);

      this.logger.log(`MachineRegistered: machineId=${machineId} tokenId=${tokenId.toString()}`);
      await this.handleWithRetry(() =>
        this.prisma.machine.updateMany({
          where: {
            OR: [
              { machineId },
              { onchainTxHash: log.transactionHash },
            ],
          },
          data: {
            machineId,
            onchainTokenId: tokenId.toString(),
            onchainTxHash: log.transactionHash,
            status: 'ACTIVE',
          },
        }),
      );
    }
  }

  private async processUsageRightEvents(address: string, fromBlock: number, toBlock: number) {
    const mintedTopic = this.usageRightIface.getEvent('UsageRightMinted').topicHash;
    const consumedTopic = this.usageRightIface.getEvent('UsageRightConsumed').topicHash;

    const [mintLogs, consumedLogs] = await Promise.all([
      this.blockchain.provider.getLogs({ address, topics: [mintedTopic], fromBlock, toBlock }),
      this.blockchain.provider.getLogs({ address, topics: [consumedTopic], fromBlock, toBlock }),
    ]);

    for (const log of mintLogs) {
      const parsed = this.usageRightIface.parseLog(log);
      if (!parsed || parsed.name !== 'UsageRightMinted') continue;

      const usageRightId = this.toBigInt(parsed.args.usageRightId ?? parsed.args[0]);
      this.logger.log(`UsageRightMinted: tokenId=${usageRightId.toString()}`);
      await this.handleWithRetry(() =>
        this.prisma.usageRight.updateMany({
          where: { onchainTxHash: log.transactionHash },
          data: { onchainTokenId: usageRightId.toString() },
        }),
      );
    }

    for (const log of consumedLogs) {
      const parsed = this.usageRightIface.parseLog(log);
      if (!parsed || parsed.name !== 'UsageRightConsumed') continue;

      const usageRightId = this.toBigInt(parsed.args.usageRightId ?? parsed.args[0]);
      this.logger.log(`UsageRightConsumed: tokenId=${usageRightId.toString()}`);
      await this.handleWithRetry(() =>
        this.prisma.usageRight.updateMany({
          where: { onchainTokenId: usageRightId.toString() },
          data: { status: 'CONSUMED' },
        }),
      );
    }
  }

  private async processSettlementEvents(address: string, fromBlock: number, toBlock: number) {
    const usageSettledTopic = this.settlementIface.getEvent('UsageSettled').topicHash;
    const logs = await this.blockchain.provider.getLogs({
      address,
      topics: [usageSettledTopic],
      fromBlock,
      toBlock,
    });

    for (const log of logs) {
      const parsed = this.settlementIface.parseLog(log);
      if (!parsed || parsed.name !== 'UsageSettled') continue;

      const referenceId = String(parsed.args.sessionId ?? parsed.args.referenceId ?? parsed.args[0]);
      const venueShare = this.toBigInt(parsed.args.venueShare ?? parsed.args[2]);
      const platformShare = this.toBigInt(parsed.args.platformShare ?? parsed.args[3]);
      this.logger.log(
        `UsageSettled: ref=${referenceId} venueShare=${venueShare.toString()} platformShare=${platformShare.toString()}`,
      );

      await this.handleWithRetry(async () => {
        const existing = await this.prisma.ledgerEntry.findFirst({
          where: { txHash: log.transactionHash },
        });
        if (existing) {
          this.logger.warn(`tx_hash 重複排除: ${log.transactionHash} は既に記録済みのためスキップ`);
          return;
        }

        await this.prisma.ledgerEntry.create({
          data: {
            entryType: 'PAYMENT',
            referenceType: 'USAGE',
            referenceId,
            toWallet: null,
            amountJpyc: venueShare.toString(),
            txHash: log.transactionHash,
            status: 'CONFIRMED',
            confirmedAt: new Date(),
          },
        });
      });
    }
  }

  private async processComputeRightEvents(address: string, fromBlock: number, toBlock: number) {
    const mintedTopic = this.computeRightIface.getEvent('ComputeRightMinted').topicHash;
    const completedTopic = this.computeRightIface.getEvent('JobCompleted').topicHash;
    const interruptedTopic = this.computeRightIface.getEvent('JobInterrupted').topicHash;

    const [mintLogs, completedLogs, interruptedLogs] = await Promise.all([
      this.blockchain.provider.getLogs({ address, topics: [mintedTopic], fromBlock, toBlock }),
      this.blockchain.provider.getLogs({ address, topics: [completedTopic], fromBlock, toBlock }),
      this.blockchain.provider.getLogs({ address, topics: [interruptedTopic], fromBlock, toBlock }),
    ]);

    for (const log of mintLogs) {
      const parsed = this.computeRightIface.parseLog(log);
      if (!parsed || parsed.name !== 'ComputeRightMinted') continue;

      const tokenId = this.toBigInt(parsed.args.tokenId ?? parsed.args[1]);
      this.logger.log(`ComputeRightMinted: tokenId=${tokenId.toString()}`);
      await this.handleWithRetry(() =>
        this.prisma.computeRight.updateMany({
          where: { onchainTxHash: log.transactionHash },
          data: { onchainTokenId: tokenId.toString() },
        }),
      );
    }

    for (const log of completedLogs) {
      const parsed = this.computeRightIface.parseLog(log);
      if (!parsed || parsed.name !== 'JobCompleted') continue;

      const tokenId = this.toBigInt(parsed.args.tokenId ?? parsed.args[0]);
      this.logger.log(`JobCompleted: tokenId=${tokenId.toString()}`);
      await this.handleWithRetry(() =>
        this.prisma.computeJob.updateMany({
          where: { computeRight: { onchainTokenId: tokenId.toString() } },
          data: { status: 'COMPLETED', onchainTxHash: log.transactionHash, endedAt: new Date() },
        }),
      );
    }

    for (const log of interruptedLogs) {
      const parsed = this.computeRightIface.parseLog(log);
      if (!parsed || parsed.name !== 'JobInterrupted') continue;

      const tokenId = this.toBigInt(parsed.args.tokenId ?? parsed.args[0]);
      this.logger.log(`JobInterrupted: tokenId=${tokenId.toString()}`);
      await this.handleWithRetry(() =>
        this.prisma.computeJob.updateMany({
          where: { computeRight: { onchainTokenId: tokenId.toString() } },
          data: { status: 'INTERRUPTED', onchainTxHash: log.transactionHash, endedAt: new Date() },
        }),
      );
    }
  }

  private async processRevenueRightEvents(address: string, fromBlock: number, toBlock: number) {
    const allocationTopic = this.revenueRightIface.getEvent('AllocationRecorded').topicHash;
    const claimedTopic = this.revenueRightIface.getEvent('Claimed').topicHash;

    const [allocationLogs, claimedLogs] = await Promise.all([
      this.blockchain.provider.getLogs({ address, topics: [allocationTopic], fromBlock, toBlock }),
      this.blockchain.provider.getLogs({ address, topics: [claimedTopic], fromBlock, toBlock }),
    ]);

    for (const log of allocationLogs) {
      const parsed = this.revenueRightIface.parseLog(log);
      if (!parsed || parsed.name !== 'AllocationRecorded') continue;

      const allocationId = this.toBigInt(parsed.args.allocationId ?? parsed.args[0]).toString();
      const programId = this.toBigInt(parsed.args.programId ?? parsed.args[1]).toString();
      const totalAmount = this.toBigInt(parsed.args.totalAmountJpyc ?? parsed.args[2]).toString();
      this.logger.log(`AllocationRecorded: allocationId=${allocationId} programId=${programId}`);

      await this.handleWithRetry(async () => {
        const updated = await this.prisma.revenueAllocation.updateMany({
          where: {
            allocationTxHash: null,
            totalAmountJpyc: totalAmount,
            revenueProgram: {
              revenueRights: {
                some: { onchainTokenId: programId },
              },
            },
          },
          data: { allocationTxHash: log.transactionHash },
        });

        if (updated.count === 0) {
          await this.prisma.revenueAllocation.updateMany({
            where: { allocationTxHash: null },
            data: { allocationTxHash: log.transactionHash },
          });
        }
      });
    }

    for (const log of claimedLogs) {
      const parsed = this.revenueRightIface.parseLog(log);
      if (!parsed || parsed.name !== 'Claimed') continue;

      const holder = String(parsed.args.holder ?? parsed.args[0]);
      const programId = this.toBigInt(parsed.args.programId ?? parsed.args[1]).toString();
      const allocationId = this.toBigInt(parsed.args.allocationId ?? parsed.args[2]).toString();
      const amountJpyc = this.toBigInt(parsed.args.amountJpyc ?? parsed.args[3]).toString();
      this.logger.log(
        `Claimed: holder=${holder} programId=${programId} allocationId=${allocationId} amount=${amountJpyc}`,
      );

      await this.handleWithRetry(async () => {
        const existing = await this.prisma.ledgerEntry.findFirst({
          where: { txHash: log.transactionHash },
        });
        if (!existing) {
          await this.prisma.ledgerEntry.create({
            data: {
              entryType: 'CLAIM',
              referenceType: 'REVENUE',
              referenceId: allocationId,
              toWallet: holder,
              amountJpyc,
              txHash: log.transactionHash,
              status: 'CONFIRMED',
              confirmedAt: new Date(),
            },
          });
        }

        await this.prisma.revenueClaim.updateMany({
          where: {
            claimTxHash: null,
            claimedAmountJpyc: amountJpyc,
            revenueRight: {
              onchainTokenId: programId,
              holder: {
                walletAddress: {
                  equals: holder,
                  mode: 'insensitive',
                },
              },
            },
          },
          data: { claimTxHash: log.transactionHash },
        });
      });
    }
  }

  private async processMarketplaceEvents(address: string, fromBlock: number, toBlock: number) {
    const listedTopic = this.marketplaceIface.getEvent('Listed').topicHash;
    const purchasedTopic = this.marketplaceIface.getEvent('Purchased').topicHash;
    const cancelledTopic = this.marketplaceIface.getEvent('Cancelled').topicHash;

    const [listedLogs, purchasedLogs, cancelledLogs] = await Promise.all([
      this.blockchain.provider.getLogs({ address, topics: [listedTopic], fromBlock, toBlock }),
      this.blockchain.provider.getLogs({ address, topics: [purchasedTopic], fromBlock, toBlock }),
      this.blockchain.provider.getLogs({ address, topics: [cancelledTopic], fromBlock, toBlock }),
    ]);

    for (const log of listedLogs) {
      const parsed = this.marketplaceIface.parseLog(log);
      if (!parsed || parsed.name !== 'Listed') continue;

      const listingId = this.toBigInt(parsed.args.listingId ?? parsed.args[0]).toString();
      const tokenId = this.toBigInt(parsed.args.tokenId ?? parsed.args[1]).toString();
      this.logger.log(`Listed: listingId=${listingId} tokenId=${tokenId}`);
      await this.handleWithRetry(() =>
        this.prisma.usageListing.updateMany({
          where: { usageRight: { onchainTokenId: tokenId }, status: 'ACTIVE' },
          data: { onchainListingId: listingId, onchainTxHash: log.transactionHash },
        }),
      );
    }

    for (const log of purchasedLogs) {
      const parsed = this.marketplaceIface.parseLog(log);
      if (!parsed || parsed.name !== 'Purchased') continue;

      const listingId = this.toBigInt(parsed.args.listingId ?? parsed.args[0]).toString();
      this.logger.log(`Purchased: listingId=${listingId}`);
      await this.handleWithRetry(() =>
        this.prisma.usageListing.updateMany({
          where: { onchainListingId: listingId },
          data: { status: 'SOLD', onchainTxHash: log.transactionHash, soldAt: new Date() },
        }),
      );
    }

    for (const log of cancelledLogs) {
      const parsed = this.marketplaceIface.parseLog(log);
      if (!parsed || parsed.name !== 'Cancelled') continue;

      const listingId = this.toBigInt(parsed.args.listingId ?? parsed.args[0]).toString();
      this.logger.log(`Cancelled: listingId=${listingId}`);
      await this.handleWithRetry(() =>
        this.prisma.usageListing.updateMany({
          where: { onchainListingId: listingId },
          data: { status: 'CANCELLED', onchainTxHash: log.transactionHash },
        }),
      );
    }
  }

  // =========================================================================
  // カーソル永続化
  // =========================================================================

  private async readCursor(): Promise<number | null> {
    const row = await this.prisma.idempotencyKey.findUnique({
      where: { key: LISTENER_CURSOR_KEY },
      select: { response: true },
    });
    if (!row || !row.response || typeof row.response !== 'object') return null;

    const maybeBlock = (row.response as { block?: unknown }).block;
    const blockNumber = Number(maybeBlock);
    if (!Number.isFinite(blockNumber) || blockNumber < 0) return null;
    return Math.floor(blockNumber);
  }

  private async saveCursor(block: number): Promise<void> {
    await this.prisma.idempotencyKey.upsert({
      where: { key: LISTENER_CURSOR_KEY },
      create: {
        key: LISTENER_CURSOR_KEY,
        requestHash: String(block),
        response: { block },
      },
      update: {
        requestHash: String(block),
        response: { block },
      },
    });
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

    const timedOutRights = await this.prisma.usageRight.updateMany({
      where: {
        status: 'MINTED',
        createdAt: { lt: cutoff },
        onchainTxHash: { not: null },
        onchainTokenId: null,
      },
      data: { status: 'CANCELLED' },
    });

    const staleMachines = await this.prisma.machine.findMany({
      where: {
        status: 'REGISTERED',
        createdAt: { lt: cutoff },
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
        `未確認マシン: ${staleMachines.length} 件が 5 分以上未確認 (IDs: ${staleMachines.map((m) => m.id).join(', ')})`,
      );
    }
  }

  // =========================================================================
  // ユーティリティ
  // =========================================================================

  private toBigInt(value: unknown): bigint {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') return BigInt(value);
    if (typeof value === 'string') return BigInt(value);
    return BigInt(String(value));
  }

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
          this.logger.warn(
            `イベントハンドラ失敗（${i + 1} 回目）。${delay * Math.pow(2, i)}ms 後リトライ: ${msg}`,
          );
          await new Promise((r) => setTimeout(r, delay * Math.pow(2, i)));
        }
      }
    }
  }
}
