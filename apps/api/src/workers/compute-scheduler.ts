import 'dotenv/config';
import { PrismaService } from '../prisma/prisma.service';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

class ComputeSchedulerWorker {
  constructor(private readonly prisma: PrismaService) {}

  // RUNNING 状態で maxDurationMinutes 超過したジョブを FAILED に更新する
  async checkOverdueJobs(now = new Date()): Promise<void> {
    const runningJobs = await this.prisma.computeJob.findMany({
      where: { status: 'RUNNING', startedAt: { not: null } },
      include: {
        computeRight: {
          include: { computeProduct: true },
        },
      },
    });

    let updatedCount = 0;
    for (const job of runningJobs) {
      const product = job.computeRight?.computeProduct;
      if (!product || !job.startedAt) continue;

      const durationMs = (product.maxDurationMinutes ?? 60) * 60 * 1000;
      const deadline = new Date(job.startedAt.getTime() + durationMs);

      if (now > deadline) {
        await this.prisma.computeJob.update({
          where: { id: job.id },
          data: {
            status: 'FAILED',
            endedAt: now,
            interruptionReason: 'タイムアウト',
          },
        });
        updatedCount += 1;
      }
    }

    if (updatedCount > 0) {
      console.log(`[compute-scheduler] overdue jobs updated: ${updatedCount}`);
    }
  }

  // ISSUED 状態で 7 日超の算力権を EXPIRED に更新する
  async expireStaleRights(now = new Date()): Promise<void> {
    const cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const result = await this.prisma.computeRight.updateMany({
      where: {
        status: 'ISSUED',
        createdAt: { lt: cutoff },
      },
      data: { status: 'EXPIRED' },
    });

    if (result.count > 0) {
      console.log(`[compute-scheduler] stale compute rights expired: ${result.count}`);
    }
  }
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();

  const worker = new ComputeSchedulerWorker(prisma);

  console.log('[compute-scheduler] worker started');

  // 起動時に一度実行して、次に interval 実行へ移る
  await worker.checkOverdueJobs();
  await worker.expireStaleRights();

  const minuteTimer = setInterval(() => {
    void worker.checkOverdueJobs().catch((err) => {
      console.error('[compute-scheduler] checkOverdueJobs failed:', err);
    });
  }, MINUTE_MS);

  const hourTimer = setInterval(() => {
    void worker.expireStaleRights().catch((err) => {
      console.error('[compute-scheduler] expireStaleRights failed:', err);
    });
  }, HOUR_MS);

  const shutdown = async (signal: string) => {
    console.log(`[compute-scheduler] ${signal} received, shutting down...`);
    clearInterval(minuteTimer);
    clearInterval(hourTimer);
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
  console.error('[compute-scheduler] fatal error:', err);
  process.exit(1);
});

