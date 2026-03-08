import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { RevenueRightContractService } from '../../../blockchain/revenue-right.contract.service';

type SettlementCycle = 'DAILY' | 'WEEKLY' | 'MONTHLY';
type RevenueScope = 'USAGE_ONLY' | 'COMPUTE_ONLY' | 'ALL';

interface BatchInput {
  programId?: string;
  now?: Date;
  dryRun?: boolean;
}

interface ProgramSummary {
  programId: string;
  periodsEvaluated: number;
  allocationsCreated: number;
  allocationsSkipped: number;
}

@Injectable()
export class RevenueAllocationService {
  private readonly logger = new Logger(RevenueAllocationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly revenueContract: RevenueRightContractService,
  ) {}

  async runBatch(input: BatchInput = {}) {
    const now = input.now ?? new Date();
    const dryRun = input.dryRun ?? false;

    const programs = await this.prisma.revenueProgram.findMany({
      where: {
        ...(input.programId ? { id: input.programId } : {}),
        status: { in: ['ISSUED', 'ACTIVE'] },
      },
      include: {
        machine: {
          select: { venueId: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    let periodsEvaluated = 0;
    let allocationsCreated = 0;
    let allocationsSkipped = 0;
    let totalAllocated = 0n;
    const summaries: ProgramSummary[] = [];

    for (const program of programs) {
      if (!program.machine?.venueId) continue;

      const cycle = (program.settlementCycle as SettlementCycle) ?? 'MONTHLY';
      const scope = (program.revenueScope as RevenueScope) ?? 'ALL';

      const summary: ProgramSummary = {
        programId: program.id,
        periodsEvaluated: 0,
        allocationsCreated: 0,
        allocationsSkipped: 0,
      };

      const firstCursor = await this.resolveStartCursor(program.id, program.startAt);
      const upperBound = this.minDate(now, program.endAt);

      let cursor = firstCursor;
      while (cursor < upperBound) {
        const nextEnd = this.minDate(this.addCycle(cursor, cycle), upperBound);
        if (nextEnd <= cursor) break;

        periodsEvaluated += 1;
        summary.periodsEvaluated += 1;

        const exists = await this.prisma.revenueAllocation.findFirst({
          where: {
            revenueProgramId: program.id,
            allocationPeriodStart: cursor,
            allocationPeriodEnd: nextEnd,
          },
          select: { id: true },
        });
        if (exists) {
          allocationsSkipped += 1;
          summary.allocationsSkipped += 1;
          cursor = nextEnd;
          continue;
        }

        const gross = await this.sumGrossRevenue(program.machine.venueId, cursor, nextEnd, scope);
        const allocAmount = (gross * BigInt(program.shareBps)) / 10_000n;
        if (allocAmount <= 0n) {
          allocationsSkipped += 1;
          summary.allocationsSkipped += 1;
          cursor = nextEnd;
          continue;
        }

        if (!dryRun) {
          const onchainProgramId = await this.resolveOnchainProgramId(program.id);
          if (onchainProgramId == null) {
            allocationsSkipped += 1;
            summary.allocationsSkipped += 1;
            this.logger.warn(`program=${program.id} は onchainProgramId 不明のため allocation をスキップ`);
            cursor = nextEnd;
            continue;
          }

          const onchain = await this.revenueContract.recordAllocation({
            programId: onchainProgramId,
            totalAmountJpyc: allocAmount,
            periodStart: BigInt(Math.floor(cursor.getTime() / 1000)),
            periodEnd: BigInt(Math.floor(nextEnd.getTime() / 1000)),
          });
          if (!onchain) {
            allocationsSkipped += 1;
            summary.allocationsSkipped += 1;
            this.logger.warn(`program=${program.id} の on-chain recordAllocation が失敗したためスキップ`);
            cursor = nextEnd;
            continue;
          }

          await this.prisma.revenueAllocation.create({
            data: {
              revenueProgramId: program.id,
              allocationPeriodStart: cursor,
              allocationPeriodEnd: nextEnd,
              totalAmountJpyc: allocAmount.toString(),
              allocationTxHash: onchain.txHash,
            },
          });
        }

        allocationsCreated += 1;
        summary.allocationsCreated += 1;
        totalAllocated += allocAmount;
        cursor = nextEnd;
      }

      summaries.push(summary);
    }

    if (allocationsCreated > 0) {
      this.logger.log(
        `Revenue allocation batch finished: created=${allocationsCreated}, total=${totalAllocated.toString()}`,
      );
    }

    return {
      nowIso: now.toISOString(),
      dryRun,
      programsScanned: programs.length,
      periodsEvaluated,
      allocationsCreated,
      allocationsSkipped,
      totalAllocatedJpyc: totalAllocated.toString(),
      summaries,
    };
  }

  private async resolveStartCursor(programId: string, fallbackStart: Date): Promise<Date> {
    const latest = await this.prisma.revenueAllocation.findFirst({
      where: { revenueProgramId: programId },
      orderBy: { allocationPeriodEnd: 'desc' },
      select: { allocationPeriodEnd: true },
    });
    return latest?.allocationPeriodEnd ?? fallbackStart;
  }

  private addCycle(start: Date, cycle: SettlementCycle): Date {
    const next = new Date(start.getTime());
    if (cycle === 'DAILY') {
      next.setUTCDate(next.getUTCDate() + 1);
      return next;
    }
    if (cycle === 'WEEKLY') {
      next.setUTCDate(next.getUTCDate() + 7);
      return next;
    }
    next.setUTCMonth(next.getUTCMonth() + 1);
    return next;
  }

  private async sumGrossRevenue(
    venueId: string,
    start: Date,
    end: Date,
    scope: RevenueScope,
  ): Promise<bigint> {
    const settlementType =
      scope === 'USAGE_ONLY'
        ? ['USAGE']
        : scope === 'COMPUTE_ONLY'
          ? ['COMPUTE']
          : ['USAGE', 'COMPUTE', 'MIXED'];

    const rows = await this.prisma.settlement.findMany({
      where: {
        venueId,
        settlementType: { in: settlementType },
        status: { notIn: ['PENDING', 'FAILED', 'CANCELLED'] },
        OR: [
          {
            periodStart: { not: null, lt: end },
            periodEnd: { not: null, gt: start },
          },
          {
            createdAt: { gte: start, lt: end },
          },
        ],
      },
      select: { grossAmountJpyc: true },
    });

    return rows.reduce((acc, row) => {
      try {
        return acc + BigInt(row.grossAmountJpyc);
      } catch {
        return acc;
      }
    }, 0n);
  }

  private minDate(a: Date, b: Date): Date {
    return a.getTime() <= b.getTime() ? a : b;
  }

  private async resolveOnchainProgramId(programId: string): Promise<bigint | null> {
    const right = await this.prisma.revenueRight.findFirst({
      where: {
        revenueProgramId: programId,
        onchainTokenId: { not: null },
      },
      select: { onchainTokenId: true },
    });
    if (!right?.onchainTokenId) return null;

    try {
      return BigInt(right.onchainTokenId);
    } catch {
      return null;
    }
  }
}
