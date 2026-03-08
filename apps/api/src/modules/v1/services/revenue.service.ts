import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../../../prisma/prisma.service';
import { RevenueRightContractService } from '../../../blockchain/revenue-right.contract.service';

// -----------------------------------------------------------------------
// 収益プログラムサービス
// RevenueProgram / RevenueRight / RevenueAllocation / RevenueClaim の
// CRUD およびクレームロジックを管理する
// -----------------------------------------------------------------------

@Injectable()
export class RevenueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly revenueContract: RevenueRightContractService,
  ) {}

  // -----------------------------------------------------------------------
  // userId 解決
  // userId 直接指定が優先。walletAddress 指定時は users テーブルから解決する
  // -----------------------------------------------------------------------
  private async resolveUserId(input: {
    userId?: string;
    walletAddress?: string;
  }): Promise<string | null> {
    if (input.userId) return input.userId;
    if (!input.walletAddress) return null;

    const user = await this.prisma.user.findFirst({
      where: {
        walletAddress: {
          equals: input.walletAddress,
          mode: 'insensitive',
        },
      },
      select: { id: true },
    });
    return user?.id ?? null;
  }

  private toNodeId(machineId: string): string {
    if (/^0x[0-9a-fA-F]{64}$/.test(machineId)) return machineId;
    return ethers.id(machineId);
  }

  private parseAmount(raw: string | null | undefined): bigint {
    try {
      return BigInt(raw ?? '0');
    } catch {
      return 0n;
    }
  }

  async createProgramDraft(input: {
    merchantId: string;
    machineId: string;
    shareBps: number;
    revenueScope: 'USAGE_ONLY' | 'COMPUTE_ONLY' | 'ALL';
    startAt: Date;
    endAt: Date;
    settlementCycle: 'DAILY' | 'WEEKLY' | 'MONTHLY';
    payoutToken?: string;
    metadataUri?: string;
    investors: Array<{ holderUserId: string; amount1155: string }>;
  }) {
    if (input.shareBps <= 0 || input.shareBps > 4000) {
      throw new HttpException({ message: 'shareBps は 1..4000 の範囲で指定してください' }, HttpStatus.BAD_REQUEST);
    }
    if (input.endAt <= input.startAt) {
      throw new HttpException({ message: 'endAt は startAt より後である必要があります' }, HttpStatus.BAD_REQUEST);
    }
    if (input.investors.length === 0) {
      throw new HttpException({ message: 'investors は 1 件以上必要です' }, HttpStatus.BAD_REQUEST);
    }

    const machine = await this.prisma.machine.findUnique({
      where: { id: input.machineId },
      include: { venue: { select: { merchantId: true } } },
    });
    if (!machine) {
      throw new HttpException({ message: 'machine が見つかりません' }, HttpStatus.NOT_FOUND);
    }
    if (machine.venue.merchantId !== input.merchantId) {
      throw new HttpException({ message: 'この machine を発行対象にする権限がありません' }, HttpStatus.FORBIDDEN);
    }

    const userIds = [...new Set(input.investors.map((v) => v.holderUserId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true },
    });
    if (users.length !== userIds.length) {
      throw new HttpException({ message: 'investors に存在しない userId が含まれています' }, HttpStatus.BAD_REQUEST);
    }

    for (const investor of input.investors) {
      if (this.parseAmount(investor.amount1155) <= 0n) {
        throw new HttpException({ message: 'amount1155 は正の整数文字列である必要があります' }, HttpStatus.BAD_REQUEST);
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const program = await tx.revenueProgram.create({
        data: {
          machineId: input.machineId,
          shareBps: input.shareBps,
          revenueScope: input.revenueScope,
          startAt: input.startAt,
          endAt: input.endAt,
          settlementCycle: input.settlementCycle,
          payoutToken: input.payoutToken ?? 'JPYC',
          metadataUri: input.metadataUri ?? null,
          status: 'PENDING_REVIEW',
        },
      });

      await tx.revenueRight.createMany({
        data: input.investors.map((v) => ({
          revenueProgramId: program.id,
          holderUserId: v.holderUserId,
          amount1155: v.amount1155,
          status: 'PENDING_ISSUE',
        })),
      });

      return program;
    });

    return {
      programId: created.id,
      status: created.status,
      investors: input.investors.length,
    };
  }

  async approveProgram(programId: string, input?: { approverUserId?: string }) {
    const program = await this.prisma.revenueProgram.findUnique({
      where: { id: programId },
      select: { id: true, status: true },
    });
    if (!program) {
      throw new HttpException({ message: '収益プログラムが見つかりません' }, HttpStatus.NOT_FOUND);
    }
    if (program.status !== 'PENDING_REVIEW') {
      throw new HttpException({ message: '承認可能なステータスではありません' }, HttpStatus.CONFLICT);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.revenueProgram.update({
        where: { id: programId },
        data: { status: 'APPROVED' },
      });

      await tx.auditLog.create({
        data: {
          actorType: 'ADMIN',
          actorId: input?.approverUserId ?? null,
          action: 'REVENUE_PROGRAM_APPROVED',
          targetType: 'REVENUE_PROGRAM',
          targetId: programId,
          payload: {
            previousStatus: program.status,
            nextStatus: 'APPROVED',
          },
        },
      });

      return next;
    });

    return {
      programId: updated.id,
      status: updated.status,
    };
  }

  async issueProgram(programId: string, input?: { operatorUserId?: string }) {
    const program = await this.prisma.revenueProgram.findUnique({
      where: { id: programId },
      include: {
        machine: {
          select: { machineId: true },
        },
        revenueRights: {
          include: {
            holder: {
              select: { id: true, walletAddress: true },
            },
          },
        },
      },
    });
    if (!program) {
      throw new HttpException({ message: '収益プログラムが見つかりません' }, HttpStatus.NOT_FOUND);
    }
    if (program.status !== 'APPROVED') {
      throw new HttpException({ message: '承認済みプログラムのみ発行できます' }, HttpStatus.CONFLICT);
    }

    const walletToAmount = new Map<string, bigint>();
    for (const right of program.revenueRights) {
      const wallet = right.holder?.walletAddress?.toLowerCase();
      if (!wallet) {
        throw new HttpException(
          { message: `収益権 ${right.id} の holder に walletAddress がありません` },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      const amount = this.parseAmount(right.amount1155);
      if (amount <= 0n) continue;

      const prev = walletToAmount.get(wallet) ?? 0n;
      walletToAmount.set(wallet, prev + amount);
    }
    if (walletToAmount.size === 0) {
      throw new HttpException({ message: '発行対象の保有者・数量がありません' }, HttpStatus.UNPROCESSABLE_ENTITY);
    }

    const onchain = await this.revenueContract.createProgram({
      nodeId: this.toNodeId(program.machine.machineId),
      investors: [...walletToAmount.keys()],
      amounts: [...walletToAmount.values()],
      startAt: BigInt(Math.floor(program.startAt.getTime() / 1000)),
      endAt: BigInt(Math.floor(program.endAt.getTime() / 1000)),
      settlementCycle: (program.settlementCycle as 'DAILY' | 'WEEKLY' | 'MONTHLY') ?? 'MONTHLY',
    });
    if (!onchain) {
      throw new HttpException({ message: 'オンチェーン発行に失敗しました' }, HttpStatus.BAD_GATEWAY);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.revenueProgram.update({
        where: { id: program.id },
        data: { status: 'ISSUED' },
      });

      await tx.revenueRight.updateMany({
        where: { revenueProgramId: program.id },
        data: {
          onchainTokenId: onchain.programId.toString(),
          status: 'ACTIVE',
        },
      });

      await tx.auditLog.create({
        data: {
          actorType: 'SYSTEM',
          actorId: input?.operatorUserId ?? null,
          action: 'REVENUE_PROGRAM_ISSUED',
          targetType: 'REVENUE_PROGRAM',
          targetId: program.id,
          payload: {
            txHash: onchain.txHash,
            onchainProgramId: onchain.programId.toString(),
            investorCount: walletToAmount.size,
          },
        },
      });
    });

    return {
      programId: program.id,
      status: 'ISSUED',
      onchainProgramId: onchain.programId.toString(),
      txHash: onchain.txHash,
      investorCount: walletToAmount.size,
    };
  }

  // -----------------------------------------------------------------------
  // 収益プログラム一覧を取得する
  // machineId を指定した場合はその機器のプログラムのみ返す
  // -----------------------------------------------------------------------
  async listPrograms(machineId?: string) {
    return this.prisma.revenueProgram.findMany({
      where: machineId ? { machineId } : undefined,
      include: { machine: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // -----------------------------------------------------------------------
  // 収益プログラムを ID で取得する
  // 見つからない場合は 404 を返す
  // -----------------------------------------------------------------------
  async getProgram(programId: string) {
    const program = await this.prisma.revenueProgram.findUnique({
      where: { id: programId },
      include: {
        revenueRights: true,
        allocations: true,
      },
    });
    if (!program) {
      throw new HttpException(
        { message: '収益プログラムが見つかりません' },
        HttpStatus.NOT_FOUND,
      );
    }
    return program;
  }

  // -----------------------------------------------------------------------
  // ユーザーが保有する収益権一覧を取得する
  // -----------------------------------------------------------------------
  async listMyRights(input: { userId?: string; walletAddress?: string }) {
    const userId = await this.resolveUserId(input);
    if (!userId) return [];

    return this.prisma.revenueRight.findMany({
      where: { holderUserId: userId },
      include: {
        revenueProgram: {
          include: {
            machine: {
              include: {
                venue: {
                  select: { name: true },
                },
              },
            },
          },
        },
      },
    });
  }

  // -----------------------------------------------------------------------
  // 指定プログラムの配当アロケーション一覧を取得する
  // -----------------------------------------------------------------------
  async listAllocations(programId: string) {
    return this.prisma.revenueAllocation.findMany({
      where: { revenueProgramId: programId },
      orderBy: { allocationPeriodStart: 'desc' },
    });
  }

  // -----------------------------------------------------------------------
  // ユーザーのクレーム履歴一覧を取得する
  // -----------------------------------------------------------------------
  async getClaims(input: { userId?: string; walletAddress?: string }) {
    const userId = await this.resolveUserId(input);
    if (!userId) return [];

    return this.prisma.revenueClaim.findMany({
      where: {
        revenueRight: { holderUserId: userId },
      },
      include: {
        allocation: true,
        revenueRight: true,
      },
      orderBy: { claimedAt: 'desc' },
    });
  }

  // -----------------------------------------------------------------------
  // 配当をクレームする
  // 1. 収益権の所有者確認
  // 2. 重複クレームのチェック
  // 3. 比例配分計算してクレームレコードを作成する
  // -----------------------------------------------------------------------
  async claimRevenue(
    revenueRightId: string,
    allocationId: string,
    input: { userId?: string; walletAddress?: string },
  ) {
    const userId = await this.resolveUserId(input);
    if (!userId) {
      throw new HttpException(
        { message: 'ユーザーが見つかりません' },
        HttpStatus.NOT_FOUND,
      );
    }

    // 収益権の存在確認
    const revenueRight = await this.prisma.revenueRight.findUnique({
      where: { id: revenueRightId },
      include: { revenueProgram: true },
    });
    if (!revenueRight) {
      throw new HttpException(
        { message: '収益権が見つかりません' },
        HttpStatus.NOT_FOUND,
      );
    }

    // 所有者確認
    if (revenueRight.holderUserId !== userId) {
      throw new HttpException(
        { message: 'この収益権のクレーム権限がありません' },
        HttpStatus.FORBIDDEN,
      );
    }

    // アロケーションの存在確認
    const allocation = await this.prisma.revenueAllocation.findUnique({
      where: { id: allocationId },
    });
    if (!allocation) {
      throw new HttpException(
        { message: 'アロケーションが見つかりません' },
        HttpStatus.NOT_FOUND,
      );
    }
    if (allocation.revenueProgramId !== revenueRight.revenueProgramId) {
      throw new HttpException(
        { message: 'アロケーションと収益権のプログラムが一致しません' },
        HttpStatus.BAD_REQUEST,
      );
    }

    // 重複クレームチェック
    const existing = await this.prisma.revenueClaim.findFirst({
      where: { revenueRightId, allocationId },
    });
    if (existing) {
      throw new HttpException(
        { message: '既にクレーム済みです' },
        HttpStatus.CONFLICT,
      );
    }

    // 比例配分計算: totalAmountJpyc × (amount1155 / totalSupply)
    // totalSupply は amount1155 の総和を分母とする
    const rightsInProgram = await this.prisma.revenueRight.findMany({
      where: { revenueProgramId: revenueRight.revenueProgramId },
      select: { amount1155: true },
    });
    const summed = rightsInProgram.reduce((acc, r) => {
      return acc + BigInt(r.amount1155 ?? '1');
    }, 0n);
    const totalSupply = summed > 0n ? summed : 1n;
    const rightAmount = BigInt(revenueRight.amount1155 ?? '1');
    const totalAmount = BigInt(allocation.totalAmountJpyc);

    // 整数除算でクレーム額を計算する（端数切り捨て）
    const claimedAmount = (totalAmount * rightAmount) / totalSupply;

    // クレームレコードを作成する
    const claim = await this.prisma.revenueClaim.create({
      data: {
        revenueRightId,
        allocationId,
        claimedAmountJpyc: claimedAmount.toString(),
        claimTxHash: null,
      },
    });

    return claim;
  }
}
