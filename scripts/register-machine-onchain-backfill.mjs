#!/usr/bin/env node
import { parse as parseDotenv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ethers } from 'ethers';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MACHINE_CLASS_INDEX = {
  STANDARD: 0,
  GPU: 1,
  CPU: 2,
  PREMIUM: 3,
};

const MACHINE_REGISTRY_ABI = [
  'function operator() view returns (address)',
  'function registerMachine(bytes32 venueIdHash, uint8 machineClass, bytes32 specHash, string metadataURI) returns (bytes32)',
  'function updateMachineStatus(bytes32 machineId, uint8 status)',
  'function getMachineIdByToken(uint256 tokenId) view returns (bytes32)',
  'function getTokenIdByMachine(bytes32 machineId) view returns (uint256)',
  'event MachineRegistered(bytes32 indexed machineId, address indexed owner, uint256 indexed tokenId)',
];

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

  // 既にプロセスへ注入済み（Render / Vercel 由来）を最優先にする。
  for (const [key, value] of Object.entries(merged)) {
    if (!process.env[key]?.trim()) {
      process.env[key] = value;
    }
  }
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} が未設定です`);
  }
  return value;
}

function toBytes32MachineId(value) {
  const raw = value?.trim() ?? '';
  if (!/^0x[0-9a-fA-F]{64}$/.test(raw)) return null;
  return raw;
}

function buildSpecHash(row) {
  if (row.specHash && /^0x[0-9a-fA-F]{64}$/.test(row.specHash)) {
    return row.specHash;
  }
  return ethers.keccak256(
    ethers.toUtf8Bytes(
      `${row.machineClass}:${row.cpu ?? ''}:${row.gpu ?? ''}:${row.ramGb ?? 0}`,
    ),
  );
}

function machineClassToIndex(machineClass) {
  const key = (machineClass ?? '').toUpperCase();
  return MACHINE_CLASS_INDEX[key] ?? MACHINE_CLASS_INDEX.STANDARD;
}

async function findRegisteredTxHash(provider, registryAddress, machineId) {
  try {
    const topic = ethers.id('MachineRegistered(bytes32,address,uint256)');
    const logs = await provider.getLogs({
      address: registryAddress,
      topics: [topic, machineId],
      fromBlock: 0,
      toBlock: 'latest',
    });
    if (logs.length === 0) return null;
    return logs[logs.length - 1].transactionHash;
  } catch {
    return null;
  }
}

async function main() {
  loadEnvFiles();

  const databaseUrl = requiredEnv('DATABASE_URL');
  const rpcUrl = requiredEnv('AMOY_RPC_URL');
  const registryAddress = requiredEnv('MACHINE_REGISTRY_ADDRESS');
  const privateKeyRaw = requiredEnv('OPERATOR_PRIVATE_KEY');
  const privateKey = privateKeyRaw.startsWith('0x') ? privateKeyRaw : `0x${privateKeyRaw}`;

  if (!ethers.isAddress(registryAddress)) {
    throw new Error('MACHINE_REGISTRY_ADDRESS の形式が不正です');
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
    throw new Error('OPERATOR_PRIVATE_KEY の形式が不正です');
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);
  const registry = new ethers.Contract(registryAddress, MACHINE_REGISTRY_ABI, signer);
  const iface = new ethers.Interface(MACHINE_REGISTRY_ABI);

  const network = await provider.getNetwork();
  const onchainOperator = await registry.operator().catch(() => null);
  if (!onchainOperator || ethers.getAddress(onchainOperator) !== ethers.getAddress(signer.address)) {
    throw new Error(
      `MachineRegistry.operator 不一致 expected=${ethers.getAddress(signer.address)} actual=${String(onchainOperator)}`,
    );
  }

  const targets = await prisma.machine.findMany({
    where: {
      status: { in: ['REGISTERED', 'ACTIVE'] },
      computeProducts: { some: { status: 'ACTIVE' } },
    },
    include: {
      computeProducts: {
        where: { status: 'ACTIVE' },
        select: { id: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  let registered = 0;
  let backfilled = 0;
  let skipped = 0;
  let failed = 0;

  console.log(
    `[register-machine-onchain-backfill] start network=${network.chainId.toString()} signer=${signer.address} targets=${targets.length}`,
  );

  for (const row of targets) {
    try {
      let nextMachineId = toBytes32MachineId(row.machineId);
      let nextTokenId = row.onchainTokenId && /^\d+$/.test(row.onchainTokenId) ? row.onchainTokenId : null;
      let nextTxHash = row.onchainTxHash?.trim() || null;
      const metadataUri = row.metadataUri ?? '';

      if (nextMachineId) {
        const tokenByMachine = await registry.getTokenIdByMachine(nextMachineId).catch(() => 0n);
        if (tokenByMachine && tokenByMachine > 0n) {
          nextTokenId = tokenByMachine.toString();
          if (!nextTxHash) {
            nextTxHash = await findRegisteredTxHash(provider, registryAddress, nextMachineId);
          }
        }
      }

      if (!nextTokenId) {
        const venueIdHash = ethers.keccak256(ethers.toUtf8Bytes(row.venueId));
        const machineClass = machineClassToIndex(row.machineClass);
        const specHash = buildSpecHash(row);

        const tx = await registry.registerMachine(
          venueIdHash,
          machineClass,
          specHash,
          metadataUri,
        );
        const receipt = await tx.wait();

        const event = receipt?.logs
          ?.map((log) => {
            try {
              return iface.parseLog(log);
            } catch {
              return null;
            }
          })
          ?.find((parsed) => parsed?.name === 'MachineRegistered');

        if (!event) {
          throw new Error('MachineRegistered イベントを取得できませんでした');
        }

        nextMachineId = String(event.args.machineId);
        nextTokenId = String(event.args.tokenId);
        nextTxHash = receipt.hash;
        registered += 1;

        // DB と同じ ACTIVE 状態へオンチェーンも合わせる。
        await registry.updateMachineStatus(nextMachineId, 1).catch(() => null);
      }

      if (!nextMachineId || !nextTokenId) {
        failed += 1;
        console.error(`[register-machine-onchain-backfill] skip-invalid machine=${row.id}`);
        continue;
      }

      const changed =
        row.machineId !== nextMachineId
        || row.onchainTokenId !== nextTokenId
        || row.onchainTxHash !== nextTxHash
        || row.status !== 'ACTIVE'
        || (!row.specHash && !!buildSpecHash(row));

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
          specHash: row.specHash ?? buildSpecHash(row),
          status: 'ACTIVE',
        },
      });
      backfilled += 1;

      console.log(
        `[register-machine-onchain-backfill] ok machine=${row.id} tokenId=${nextTokenId} tx=${nextTxHash ?? 'n/a'}`,
      );
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[register-machine-onchain-backfill] failed machine=${row.id} reason=${message}`);
    }
  }

  console.log(
    `[register-machine-onchain-backfill] done registered=${registered} backfilled=${backfilled} skipped=${skipped} failed=${failed}`,
  );

  await prisma.$disconnect();
}

void main().catch((error) => {
  console.error('[register-machine-onchain-backfill] 致命的エラー:', error);
  process.exit(1);
});

