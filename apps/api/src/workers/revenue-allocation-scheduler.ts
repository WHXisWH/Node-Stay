import 'dotenv/config';
import { PrismaService } from '../prisma/prisma.service';
import { RevenueAllocationService } from '../modules/v1/services/revenue-allocation.service';
import { BlockchainService } from '../blockchain/blockchain.service';
import { RevenueRightContractService } from '../blockchain/revenue-right.contract.service';

const HOUR_MS = 60 * 60 * 1000;

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();

  const blockchain = new BlockchainService();
  await blockchain.onModuleInit();
  const revenueContract = new RevenueRightContractService(blockchain);
  const service = new RevenueAllocationService(prisma, revenueContract);

  console.log('[revenue-allocation] worker started');

  const runOnce = async () => {
    try {
      const summary = await service.runBatch();
      if (summary.allocationsCreated > 0) {
        console.log(
          `[revenue-allocation] created=${summary.allocationsCreated}, total=${summary.totalAllocatedJpyc}`,
        );
      }
    } catch (err) {
      console.error('[revenue-allocation] batch failed:', err);
    }
  };

  await runOnce();
  const timer = setInterval(() => {
    void runOnce();
  }, HOUR_MS);

  const shutdown = async (signal: string) => {
    console.log(`[revenue-allocation] ${signal} received, shutting down...`);
    clearInterval(timer);
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
}

void main().catch((err) => {
  console.error('[revenue-allocation] fatal error:', err);
  process.exit(1);
});
