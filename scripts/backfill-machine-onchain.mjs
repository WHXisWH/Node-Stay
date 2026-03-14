#!/usr/bin/env node
import { parse as parseDotenv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ethers } from 'ethers';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvFiles() {
  const rootEnv = resolve(process.cwd(), '.env');
  const apiEnv = resolve(process.cwd(), 'apps/api/.env');
  const merged = {};

  // root -> apps/api の順で読み、apps/api を優先値にする。
  if (existsSync(rootEnv)) {
    Object.assign(merged, parseDotenv(readFileSync(rootEnv)));
  }
  if (existsSync(apiEnv)) {
    Object.assign(merged, parseDotenv(readFileSync(apiEnv)));
  }

  // 既にプロセスへ注入済み（Render/Vercel 由来）の値を最優先にする。
  for (const [key, value] of Object.entries(merged)) {
    if (!process.env[key]?.trim()) {
      process.env[key] = value;
    }
  }
}

/**
 * 機器のオンチェーン登録情報をトランザクションレシートから再同期するスクリプト。
 * - txHash から MachineRegistered イベントを復元
 * - tokenId から machineId を逆引き
 * - machineId から tokenId を逆引き
 * 上記を組み合わせて machineId / onchainTokenId / status を整合させる。
 */
async function main() {
  loadEnvFiles();

  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL が未設定です（.env または apps/api/.env を確認してください）');
  }

  const rpcUrl = process.env.AMOY_RPC_URL;
  if (!rpcUrl) {
    throw new Error('AMOY_RPC_URL が未設定です');
  }
  const machineRegistryAddress = process.env.MACHINE_REGISTRY_ADDRESS?.trim();
  if (!machineRegistryAddress || !ethers.isAddress(machineRegistryAddress)) {
    throw new Error('MACHINE_REGISTRY_ADDRESS が未設定、またはアドレス形式が不正です');
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  const prisma = new PrismaClient({ adapter });
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
