#!/usr/bin/env node
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { ethers } from 'ethers';

/**
 * 機器のオンチェーン登録情報をトランザクションレシートから再同期するスクリプト。
 * - machine.onchainTxHash を起点に MachineRegistered イベントを復元
 * - machineId / onchainTokenId / status を整合させる
 */
async function main() {
  const rpcUrl = process.env.AMOY_RPC_URL;
  if (!rpcUrl) {
    throw new Error('AMOY_RPC_URL が未設定です');
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const prisma = new PrismaClient();
  const iface = new ethers.Interface([
    'event MachineRegistered(bytes32 indexed machineId, address indexed owner, uint256 indexed tokenId)',
  ]);

  const rows = await prisma.machine.findMany({
    where: { onchainTxHash: { not: null } },
    select: { id: true, machineId: true, onchainTxHash: true, onchainTokenId: true },
    orderBy: { createdAt: 'asc' },
  });

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const txHash = row.onchainTxHash?.trim();
    if (!txHash) {
      skipped += 1;
      continue;
    }

    try {
      const receipt = await provider.getTransactionReceipt(txHash);
      if (!receipt || receipt.status !== 1) {
        skipped += 1;
        continue;
      }

      let machineId = null;
      let tokenId = null;
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog(log);
          if (parsed.name !== 'MachineRegistered') continue;
          machineId = String(parsed.args.machineId);
          tokenId = String(parsed.args.tokenId);
          break;
        } catch {
          // 対象イベント以外は無視する
        }
      }

      if (!machineId || !tokenId) {
        skipped += 1;
        continue;
      }

      await prisma.machine.update({
        where: { id: row.id },
        data: {
          machineId,
          onchainTokenId: tokenId,
          status: 'ACTIVE',
        },
      });
      updated += 1;
    } catch (e) {
      failed += 1;
      console.error(`[backfill-machine-onchain] 失敗 id=${row.id} tx=${txHash}:`, e);
    }
  }

  console.log(
    `[backfill-machine-onchain] 完了 updated=${updated} skipped=${skipped} failed=${failed}`,
  );
  await prisma.$disconnect();
}

void main().catch((e) => {
  console.error('[backfill-machine-onchain] 致命的エラー:', e);
  process.exit(1);
});

