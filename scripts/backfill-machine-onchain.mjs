#!/usr/bin/env node
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { ethers } from 'ethers';

/**
 * 機器のオンチェーン登録情報をトランザクションレシートから再同期するスクリプト。
 * - txHash から MachineRegistered イベントを復元
 * - tokenId から machineId を逆引き
 * - machineId から tokenId を逆引き
 * 上記を組み合わせて machineId / onchainTokenId / status を整合させる。
 */
async function main() {
  const rpcUrl = process.env.AMOY_RPC_URL;
  if (!rpcUrl) {
    throw new Error('AMOY_RPC_URL が未設定です');
  }
  const machineRegistryAddress = process.env.MACHINE_REGISTRY_ADDRESS?.trim();
  if (!machineRegistryAddress || !ethers.isAddress(machineRegistryAddress)) {
    throw new Error('MACHINE_REGISTRY_ADDRESS が未設定、またはアドレス形式が不正です');
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const prisma = new PrismaClient();
  const iface = new ethers.Interface([
    'event MachineRegistered(bytes32 indexed machineId, address indexed owner, uint256 indexed tokenId)',
  ]);
  const registry = new ethers.Contract(
    machineRegistryAddress,
    [
      'function getMachineIdByToken(uint256 tokenId) view returns (bytes32)',
      'function getTokenIdByMachine(bytes32 machineId) view returns (uint256)',
    ],
    provider,
  );

  const rows = await prisma.machine.findMany({
    select: { id: true, machineId: true, onchainTxHash: true, onchainTokenId: true, status: true },
    orderBy: { createdAt: 'asc' },
  });

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const txHash = row.onchainTxHash?.trim() ?? '';
    let nextMachineId =
      /^0x[0-9a-fA-F]{64}$/.test(row.machineId ?? '')
        ? row.machineId
        : null;
    let nextTokenId = row.onchainTokenId && /^\d+$/.test(row.onchainTokenId)
      ? row.onchainTokenId
      : null;
    let nextTxHash = txHash || null;

    try {
      // 1) txHash がある場合はレシートから MachineRegistered を最優先で復元する
      if (txHash) {
        const receipt = await provider.getTransactionReceipt(txHash);
        if (receipt && receipt.status === 1) {
          for (const log of receipt.logs) {
            try {
              const parsed = iface.parseLog(log);
              if (parsed.name !== 'MachineRegistered') continue;
              nextMachineId = String(parsed.args.machineId);
              nextTokenId = String(parsed.args.tokenId);
              nextTxHash = receipt.hash;
              break;
            } catch {
              // 対象イベント以外は無視する
            }
          }
        }
      }

      // 2) tokenId があるのに machineId が不正な場合は tokenId から逆引きする
      if (!nextMachineId && nextTokenId) {
        try {
          const machineIdByToken = await registry.getMachineIdByToken(BigInt(nextTokenId));
          if (machineIdByToken && machineIdByToken !== ethers.ZeroHash) {
            nextMachineId = String(machineIdByToken);
          }
        } catch {
          // 逆引き不可の場合は後続判定に任せる
        }
      }

      // 3) machineId があるのに tokenId が欠落している場合は machineId から逆引きする
      if (nextMachineId && !nextTokenId) {
        try {
          const tokenIdByMachine = await registry.getTokenIdByMachine(nextMachineId);
          if (tokenIdByMachine && tokenIdByMachine > 0n) {
            nextTokenId = tokenIdByMachine.toString();
          }
        } catch {
          // 逆引き不可の場合は後続判定に任せる
        }
      }

      if (!nextMachineId || !nextTokenId) {
        skipped += 1;
        continue;
      }

      const changed =
        row.machineId !== nextMachineId
        || row.onchainTokenId !== nextTokenId
        || row.onchainTxHash !== nextTxHash
        || row.status !== 'ACTIVE';
      if (!changed) {
        skipped += 1;
        continue;
      }

      await prisma.machine.update({
        where: { id: row.id },
        data: {
          machineId: nextMachineId,
          onchainTokenId: nextTokenId,
          onchainTxHash: nextTxHash,
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
