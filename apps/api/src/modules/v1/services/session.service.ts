import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../../../prisma/prisma.service';
import { SettlementContractService } from '../../../blockchain/settlement.contract.service';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settlement: SettlementContractService,
  ) {}

  // デモ用ユーザーIDを取得（最初のユーザーを利用）
  private async resolveDemoUserId(): Promise<string> {
    const user = await this.prisma.user.findFirst({ select: { id: true } });
    if (!user) throw new Error('ユーザーが存在しません。DBシードを確認してください。');
    return user.id;
  }

  async startSession(input: {
    usageRightId: string;
    machineId?: string;
    venueId: string;
    checkinMethod?: string;
    userId?: string;
  }) {
    const userId = input.userId ?? (await this.resolveDemoUserId());

    // 使用権を CHECKED_IN に更新
    await this.prisma.usageRight.update({
      where: { id: input.usageRightId },
      data: { status: 'CHECKED_IN' },
    });

    const session = await this.prisma.session.create({
      data: {
        usageRightId: input.usageRightId,
        userId,
        machineId: input.machineId ?? null,
        venueId: input.venueId,
        checkedInAt: new Date(),
        status: 'IN_USE',
        checkinMethod: input.checkinMethod ?? 'QR',
      },
    });

    return session;
  }

  async endSession(sessionId: string) {
    // 精算計算に必要な関連データを一括取得
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      include: {
        usageRight: {
          include: {
            usageProduct: true,
          },
        },
        venue: {
          include: {
            merchant: true,
          },
        },
      },
    });
    if (!session) return null;

    const checkedOutAt = new Date();
    const usedMinutes = session.checkedInAt
      ? Math.ceil((checkedOutAt.getTime() - session.checkedInAt.getTime()) / 60000)
      : 0;

    const ended = await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        checkedOutAt,
        status: 'COMPLETED',
        notes: `利用時間: ${usedMinutes}分`,
      },
    });

    // 使用権を CONSUMED に更新
    await this.prisma.usageRight.update({
      where: { id: session.usageRightId },
      data: { status: 'CONSUMED' },
    });

    // オンチェーン精算を非同期で試みる（失敗してもオフライン動作を継続）
    const sessionRef = SettlementContractService.toReferenceId(sessionId);
    const machineRef = session.machineId
      ? SettlementContractService.toReferenceId(session.machineId)
      : ethers.ZeroHash;

    // 請求金額: usageProduct.priceJpyc を 18 decimals 相当に変換（100 倍で近似）
    const rawPrice = session.usageRight?.usageProduct?.priceJpyc ?? '0';
    const grossAmountJpyc = BigInt(rawPrice) * 100n;

    // 店舗（マーチャント）のトレジャリーウォレット（未設定時は ZeroAddress）
    const venueTreasury = session.venue?.merchant?.treasuryWallet ?? ethers.ZeroAddress;

    this.settlement.settleUsage({
      sessionId: sessionRef,
      machineId: machineRef,
      payer: ethers.ZeroAddress,      // 支払者ウォレットは後続フェーズで実装
      venueTreasury,
      grossAmount: grossAmountJpyc,
      platformFeeBps: 250,
      revenueFeeBps: 0,
    }).then((txHash) => {
      if (txHash) {
        this.logger.log(`settleUsage 成功: sessionId=${sessionId} txHash=${txHash}`);
        // settlementTxHash の書き戻し と 台帳エントリ作成 を並行実行
        return Promise.all([
          this.prisma.session.update({
            where: { id: sessionId },
            data: { settlementTxHash: txHash },
          }),
          this.prisma.ledgerEntry.create({
            data: {
              entryType: 'SETTLEMENT',
              referenceType: 'SESSION',
              referenceId: sessionId,
              amountJpyc: grossAmountJpyc.toString(),
              txHash,
              status: 'CONFIRMED',
              confirmedAt: new Date(),
            },
          }),
        ]);
      }
    }).catch((e) => this.logger.error(`settleUsage 後処理失敗: ${e}`));

    return { ...ended, usedMinutes };
  }

  // セッションを ID で取得する
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

  // ユーザーのセッション一覧を取得する
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
