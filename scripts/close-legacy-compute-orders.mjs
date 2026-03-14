#!/usr/bin/env node
import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ethers } from 'ethers';

/**
 * 旧 ComputeRight コントラクトで発行された未収束ジョブを収束させる。
 *
 * - 旧コントラクト上の権利を検出（onchainTxHash の tx.to で判定）
 * - 状態が ISSUED の場合は startJob -> failJob で全額返金
 * - 状態が RESERVED/RUNNING の場合は failJob で全額返金
 * - DB の compute_rights / compute_jobs を CANCELLED/FAILED 系へ更新
 * - computeRightId が null の孤立 PENDING ジョブも同時に収束
 *
 * デフォルトはドライラン。実行は --execute を付与する。
 */

const LEGACY_COMPUTE_ADDRESS_DEFAULT = '0xb14c3d3A6Ca41Fa6f41ceD756213AA7135c7621d';
const NEW_COMPUTE_ADDRESS_DEFAULT = '0x98CcF231bB5034664341Af00cDa9661403e3C64a';
const REASON = 'LEGACY_COMPUTE_CONTRACT_MIGRATION';

const LEGACY_ABI = [
  'function startJob(uint256 tokenId)',
  'function failJob(uint256 tokenId, address buyer)',
];

function loadEnvFiles() {
  const rootEnv = resolve(process.cwd(), '.env');
  const apiEnv = resolve(process.cwd(), 'apps/api/.env');
  if (existsSync(rootEnv)) loadDotenv({ path: rootEnv, override: false });
  if (existsSync(apiEnv)) loadDotenv({ path: apiEnv, override: true });
}

function parseWalletFromSchedulerRef(raw) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const payer = parsed?.payerWallet;
    if (typeof payer === 'string' && ethers.isAddress(payer) && payer !== ethers.ZeroAddress) {
      return ethers.getAddress(payer);
    }
    return null;
  } catch {
    return null;
  }
}

function resolveBuyerWallet(job) {
  const fromScheduler = parseWalletFromSchedulerRef(job.schedulerRef);
  if (fromScheduler) return fromScheduler;
  const fromUser = job.buyer?.walletAddress ?? null;
  if (fromUser && ethers.isAddress(fromUser) && fromUser !== ethers.ZeroAddress) {
    return ethers.getAddress(fromUser);
  }
  return null;
}

function withSslModeRequire(url) {
  const parsed = new URL(url);
  if (!parsed.searchParams.get('sslmode')) {
    parsed.searchParams.set('sslmode', 'require');
  }
  return parsed.toString();
}

async function main() {
  loadEnvFiles();

  const execute = process.argv.includes('--execute');
  const forceDbClose = process.argv.includes('--force-db-close');
  const legacyComputeRaw = process.env.LEGACY_COMPUTE_RIGHT_ADDRESS?.trim() || LEGACY_COMPUTE_ADDRESS_DEFAULT;
  const newComputeRaw = process.env.NEW_COMPUTE_RIGHT_ADDRESS?.trim() || NEW_COMPUTE_ADDRESS_DEFAULT;
  const operatorPk = process.env.OPERATOR_PRIVATE_KEY?.trim() || process.env.DEPLOYER_PRIVATE_KEY?.trim() || '';
  const rpcUrl = process.env.AMOY_RPC_URL?.trim() || 'https://rpc-amoy.polygon.technology';
  const databaseUrlRaw = process.env.DATABASE_URL?.trim() || '';

  if (!databaseUrlRaw) {
    throw new Error('DATABASE_URL が未設定です');
  }
  if (!ethers.isAddress(legacyComputeRaw)) {
    throw new Error('LEGACY_COMPUTE_RIGHT_ADDRESS が不正です');
  }
  if (!ethers.isAddress(newComputeRaw)) {
    throw new Error('NEW_COMPUTE_RIGHT_ADDRESS が不正です');
  }
  if (!operatorPk) {
    throw new Error('OPERATOR_PRIVATE_KEY または DEPLOYER_PRIVATE_KEY が未設定です');
  }

  const legacyComputeAddress = ethers.getAddress(legacyComputeRaw);
  const newComputeAddress = ethers.getAddress(newComputeRaw);

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(operatorPk, provider);
  const legacyCompute = new ethers.Contract(legacyComputeAddress, LEGACY_ABI, wallet);

  const databaseUrl = withSslModeRequire(databaseUrlRaw);
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  const summary = {
    execute,
    forceDbClose,
    legacyComputeAddress,
    newComputeAddress,
    operator: wallet.address,
    scanned: 0,
    legacyMatched: 0,
    settled: 0,
    skipped: 0,
    failed: 0,
    orphanPendingClosed: 0,
  };

  try {
    const candidates = await prisma.computeJob.findMany({
      where: {
        status: { in: ['PENDING', 'ASSIGNED', 'RUNNING'] },
        computeRightId: { not: null },
      },
      include: {
        computeRight: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const buyerUserIds = [
      ...new Set(
        candidates
          .map((job) => job.buyerUserId)
          .filter((id) => typeof id === 'string' && id.length > 0),
      ),
    ];
    const buyerUsers = buyerUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: buyerUserIds } },
          select: { id: true, walletAddress: true },
        })
      : [];
    const buyerWalletMap = new Map(
      buyerUsers.map((user) => [user.id, user.walletAddress]),
    );

    summary.scanned = candidates.length;
    console.log(`[legacy-close] candidates=${candidates.length} execute=${execute}`);

    for (const job of candidates) {
      const right = job.computeRight;
      if (!right?.onchainTxHash || !right.onchainTokenId) {
        summary.skipped += 1;
        console.log(`[legacy-close] skip job=${job.id} reason=missing_onchain_fields`);
        continue;
      }

      const mintTx = await provider.getTransaction(right.onchainTxHash);
      const txTo = mintTx?.to ? ethers.getAddress(mintTx.to) : null;
      if (!txTo || txTo !== legacyComputeAddress) {
        summary.skipped += 1;
        continue;
      }
      summary.legacyMatched += 1;

      const buyerWallet = resolveBuyerWallet({
        ...job,
        buyer: {
          walletAddress: job.buyerUserId ? (buyerWalletMap.get(job.buyerUserId) ?? null) : null,
        },
      });
      if (!buyerWallet) {
        summary.failed += 1;
        console.log(`[legacy-close] fail job=${job.id} reason=buyer_wallet_missing`);
        continue;
      }

      const tokenId = BigInt(right.onchainTokenId);
      let startTxHash = null;
      let failTxHash = null;

      try {
        if (execute) {
          try {
            const failTx = await legacyCompute.failJob(tokenId, buyerWallet);
            const failReceipt = await failTx.wait();
            failTxHash = failReceipt.hash;
          } catch {
            const startTx = await legacyCompute.startJob(tokenId);
            const startReceipt = await startTx.wait();
            startTxHash = startReceipt.hash;

            const failTx = await legacyCompute.failJob(tokenId, buyerWallet);
            const failReceipt = await failTx.wait();
            failTxHash = failReceipt.hash;
          }

          await prisma.$transaction(async (tx) => {
            await tx.computeRight.update({
              where: { id: right.id },
              data: {
                status: 'FAILED',
                onchainTxHash: failTxHash,
              },
            });
            await tx.computeJob.update({
              where: { id: job.id },
              data: {
                status: 'CANCELLED',
                interruptionReason: REASON,
                endedAt: new Date(),
                onchainTxHash: failTxHash,
              },
            });
          });
        }

        summary.settled += 1;
        console.log(
          `[legacy-close] ${execute ? 'done' : 'dryrun'} job=${job.id} right=${right.id} token=${tokenId} buyer=${buyerWallet} startTx=${startTxHash ?? '-'} failTx=${failTxHash ?? '-'}`,
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (execute && forceDbClose) {
          await prisma.$transaction(async (tx) => {
            await tx.computeRight.update({
              where: { id: right.id },
              data: {
                status: 'FAILED',
              },
            });
            await tx.computeJob.update({
              where: { id: job.id },
              data: {
                status: 'CANCELLED',
                interruptionReason: `${REASON}_MANUAL_REFUND_REQUIRED`,
                endedAt: new Date(),
              },
            });
          });
          summary.settled += 1;
          console.log(`[legacy-close] force-db-close job=${job.id} token=${tokenId} error=${msg}`);
          continue;
        }

        summary.failed += 1;
        console.log(`[legacy-close] fail job=${job.id} token=${tokenId} error=${msg}`);
      }
    }

    // computeRight 未紐付けの孤立 PENDING ジョブを収束
    if (execute) {
      const orphan = await prisma.computeJob.updateMany({
        where: {
          computeRightId: null,
          status: 'PENDING',
        },
        data: {
          status: 'CANCELLED',
          interruptionReason: REASON,
          endedAt: new Date(),
        },
      });
      summary.orphanPendingClosed = orphan.count;
    } else {
      const orphanCount = await prisma.computeJob.count({
        where: {
          computeRightId: null,
          status: 'PENDING',
        },
      });
      summary.orphanPendingClosed = orphanCount;
    }

    console.log('[legacy-close] summary', summary);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error('[legacy-close] fatal', error);
  process.exit(1);
});
