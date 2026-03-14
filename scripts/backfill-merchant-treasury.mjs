#!/usr/bin/env node
import { config as loadDotenv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ethers } from 'ethers';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 既存マーチャントの受取ウォレット（treasury_wallet）を一括で統一する。
 * checkout の 422（店舗受取ウォレット未設定）を防ぐため、
 * 既存データを指定アドレスへ強制的にそろえる。
 */
const TARGET_TREASURY_WALLET = '0x71BB0f1EBa26c41Ef6703ec30A249Bb0F293d6c8';

function loadEnvFiles() {
  const rootEnv = resolve(process.cwd(), '.env');
  const apiEnv = resolve(process.cwd(), 'apps/api/.env');
  const hasPresetDatabaseUrl = Boolean(process.env.DATABASE_URL?.trim());

  if (!hasPresetDatabaseUrl && existsSync(rootEnv)) {
    loadDotenv({ path: rootEnv, override: false });
  }
  // apps/api/.env を root より優先する。
  // ただし外部から DATABASE_URL を渡している場合は上書きしない。
  if (!hasPresetDatabaseUrl && existsSync(apiEnv)) {
    loadDotenv({ path: apiEnv, override: true });
  }
}

async function main() {
  loadEnvFiles();
  if (!ethers.isAddress(TARGET_TREASURY_WALLET) || TARGET_TREASURY_WALLET === ethers.ZeroAddress) {
    throw new Error('TARGET_TREASURY_WALLET が不正です');
  }
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL が未設定です（.env または apps/api/.env を確認してください）');
  }
  const normalizedWallet = ethers.getAddress(TARGET_TREASURY_WALLET);
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });
  const prisma = new PrismaClient({ adapter });

  try {
    const [merchantCount, venueCount] = await Promise.all([
      prisma.merchant.count(),
      prisma.venue.count(),
    ]);
    const updated = await prisma.merchant.updateMany({
      data: { treasuryWallet: normalizedWallet },
    });

    console.log(
      `[backfill-merchant-treasury] 完了 merchants=${merchantCount} venues=${venueCount} updated=${updated.count} wallet=${normalizedWallet}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error) => {
  console.error('[backfill-merchant-treasury] 致命的エラー:', error);
  process.exit(1);
});
