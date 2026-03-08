import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class ComputeService {
  constructor(private readonly prisma: PrismaService) {}

  async listMachines(venueId?: string) {
    const rows = await this.prisma.machine.findMany({
      where: {
        status: { in: ['REGISTERED', 'ACTIVE'] },
        ...(venueId ? { venueId } : {}),
      },
      include: {
        venue: {
          select: {
            name: true,
            address: true,
          },
        },
        computeProducts: {
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            priceJpyc: true,
            maxDurationMinutes: true,
          },
        },
      },
    });

    return rows.map((m) => {
      const product = m.computeProducts[0];
      const nodeId = product?.id ?? m.id;
      const status = m.status === 'ACTIVE' ? 'IDLE' : 'OFFLINE';
      const pricePerHourMinor = product ? Number(product.priceJpyc || '0') * 100 : 0;

      return {
        nodeId,
        venueId: m.venueId,
        seatId: m.localSerial ?? m.id.slice(0, 8),
        status,
        pricePerHourMinor,
        machineId: m.machineId,
        machineClass: m.machineClass,
        gpu: m.gpu,
        cpu: m.cpu,
        ramGb: m.ramGb,
        maxDurationMinutes: product?.maxDurationMinutes ?? null,
        venueName: m.venue?.name ?? null,
        address: m.venue?.address ?? null,
      };
    });
  }

  async submitJob(input: {
    buyerUserId: string;
    jobType: string;
    schedulerRef?: string;
  }) {
    const job = await this.prisma.computeJob.create({
      data: {
        buyerUserId: input.buyerUserId,
        jobType: input.jobType,
        schedulerRef: input.schedulerRef ?? null,
        status: 'PENDING',
      },
    });

    return job;
  }

  async getJob(jobId: string) {
    return this.prisma.computeJob.findUnique({ where: { id: jobId } });
  }

  async cancelJob(jobId: string) {
    const job = await this.prisma.computeJob.findUnique({ where: { id: jobId } });
    if (!job) return null;
    if (!['PENDING', 'ASSIGNED'].includes(job.status)) return null;

    return this.prisma.computeJob.update({
      where: { id: jobId },
      data: { status: 'CANCELLED' },
    });
  }

  // -----------------------------------------------------------------------
  // 算力プロダクト一覧を取得する（venueId でフィルタ可能）
  // -----------------------------------------------------------------------
  async listProducts(venueId?: string) {
    return this.prisma.computeProduct.findMany({
      where: {
        status: 'ACTIVE',
        ...(venueId
          ? { machine: { venueId } }
          : {}),
      },
      include: {
        machine: {
          select: {
            id: true,
            venueId: true,
            machineClass: true,
            cpu: true,
            gpu: true,
            ramGb: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // -----------------------------------------------------------------------
  // 算力プロダクトを ID で取得する
  // -----------------------------------------------------------------------
  async getProduct(id: string) {
    return this.prisma.computeProduct.findUnique({
      where: { id },
      include: {
        machine: {
          select: {
            id: true,
            venueId: true,
            machineClass: true,
            cpu: true,
            gpu: true,
            ramGb: true,
          },
        },
      },
    });
  }

  // -----------------------------------------------------------------------
  // ジョブの実行結果を取得する
  // -----------------------------------------------------------------------
  async getJobResult(jobId: string) {
    const job = await this.prisma.computeJob.findUnique({ where: { id: jobId } });
    if (!job) return null;
    return {
      jobId: job.id,
      status: job.status,
      resultHash: job.resultHash,
      startedAt: job.startedAt,
      endedAt: job.endedAt,
      interruptionReason: job.interruptionReason,
    };
  }
}
