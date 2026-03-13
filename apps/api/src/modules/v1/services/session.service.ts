import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { SettlementContractService } from '../../../blockchain/settlement.contract.service';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settlement: SettlementContractService,
  ) {}

  async startSession(input: {
    usageRightId: string;
    machineId?: string;
    venueId: string;
    checkinMethod?: string;
    userId: string;
  }) {
    const right = await this.prisma.usageRight.findUnique({
      where: { id: input.usageRightId },
      include: { usageProduct: true },
    });

    if (!right) {
      throw new HttpException({ message: '利用権が見つかりません' }, HttpStatus.NOT_FOUND);
    }
    if (!['MINTED', 'ACTIVE'].includes(right.status)) {
      throw new HttpException(
        { message: `この利用権はチェックインできません（現在の状態: ${right.status}）` },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (right.usageProduct.venueId !== input.venueId) {
      throw new HttpException(
        { message: 'この利用権は指定された店舗では利用できません' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (right.endAt && new Date() > right.endAt) {
      throw new HttpException(
        { message: 'この利用権は有効期限切れです' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    await this.prisma.usageRight.update({
      where: { id: input.usageRightId },
      data: { status: 'CHECKED_IN' },
    });

    return this.prisma.session.create({
      data: {
        usageRightId: input.usageRightId,
        userId: input.userId,
        machineId: input.machineId ?? null,
        venueId: input.venueId,
        checkedInAt: new Date(),
        status: 'IN_USE',
        checkinMethod: input.checkinMethod ?? 'QR',
      },
    });
  }

  async endSession(sessionId: string) {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        user: { select: { walletAddress: true } },
        usageRight: {
          include: { usageProduct: true },
        },
        venue: {
          include: { merchant: true },
        },
      },
    });
    if (!session) return null;

    const payerWallet = session.user?.walletAddress?.trim() ?? '';
    if (!payerWallet) {
      throw new HttpException(
        { message: '支払者ウォレットが未設定です' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const venueTreasury = session.venue?.merchant?.treasuryWallet?.trim() ?? '';
    if (!venueTreasury) {
      throw new HttpException(
        { message: '店舗受取ウォレットが未設定です' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const checkedOutAt = new Date();
    const usedMinutes = session.checkedInAt
      ? Math.ceil((checkedOutAt.getTime() - session.checkedInAt.getTime()) / 60000)
      : 0;
    const rawPrice = session.usageRight?.usageProduct?.priceJpyc ?? '0';
    const basePriceMinor = Number(rawPrice) * 100;

    const sessionRef = SettlementContractService.toReferenceId(sessionId);
    const machineRef = session.machineId
      ? SettlementContractService.toReferenceId(session.machineId)
      : '0x0000000000000000000000000000000000000000000000000000000000000000';
    const grossAmountJpyc = BigInt(rawPrice) * 10n ** 18n;

    this.logger.log(
      `[session.checkout] settle start sessionId=${sessionId} payer=${payerWallet} venueTreasury=${venueTreasury} amountWei=${grossAmountJpyc.toString()}`,
    );
    const txHash = await this.settlement.settleUsage({
      sessionId: sessionRef,
      machineId: machineRef,
      payer: payerWallet,
      venueTreasury,
      grossAmount: grossAmountJpyc,
      platformFeeBps: 250,
      revenueFeeBps: 0,
    });
    if (!txHash) {
      this.logger.error(`[session.checkout] settle failed sessionId=${sessionId}`);
      throw new HttpException(
        { message: 'オンチェーン決済に失敗しました' },
        HttpStatus.BAD_GATEWAY,
      );
    }
    this.logger.log(`[session.checkout] settle done sessionId=${sessionId} txHash=${txHash}`);

    const ended = await this.prisma.$transaction(async (tx) => {
      const updatedSession = await tx.session.update({
        where: { id: sessionId },
        data: {
          checkedOutAt,
          status: 'COMPLETED',
          notes: `利用時間: ${usedMinutes}分`,
          settlementTxHash: txHash,
        },
      });
      await tx.usageRight.update({
        where: { id: session.usageRightId },
        data: { status: 'CONSUMED' },
      });
      await tx.ledgerEntry.create({
        data: {
          entryType: 'SETTLEMENT',
          referenceType: 'SESSION',
          referenceId: sessionId,
          amountJpyc: grossAmountJpyc.toString(),
          txHash,
          status: 'CONFIRMED',
          confirmedAt: new Date(),
        },
      });
      return updatedSession;
    });

    return { ...ended, usedMinutes, basePriceMinor };
  }

  async getSessionById(sessionId: string) {
    return this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        usageRight: {
          include: { usageProduct: true },
        },
        venue: true,
      },
    });
  }

  async listSessions(params: { userId?: string; status?: string; limit?: number }) {
    return this.prisma.session.findMany({
      where: {
        ...(params.userId ? { userId: params.userId } : {}),
        ...(params.status ? { status: params.status } : {}),
      },
      include: {
        usageRight: {
          include: { usageProduct: true },
        },
        venue: true,
      },
      orderBy: { checkedInAt: 'desc' },
      take: params.limit ?? 20,
    });
  }
}
