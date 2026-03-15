import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../../../prisma/prisma.service';
import { SettlementContractService } from '../../../blockchain/settlement.contract.service';
import { BlockchainService } from '../../../blockchain/blockchain.service';

const DEFAULT_TREASURY_WALLET = '0x71BB0f1EBa26c41Ef6703ec30A249Bb0F293d6c8';

const ERC20_BALANCE_ALLOWANCE_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
] as const;
const ERC721_OWNER_OF_ABI = [
  'function ownerOf(uint256 tokenId) view returns (address)',
] as const;

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private static readonly WEI_PER_MINOR = 10n ** 16n; // 1 minor = 0.01 JPYC = 1e16 wei

  constructor(
    private readonly prisma: PrismaService,
    private readonly settlement: SettlementContractService,
    private readonly blockchain: BlockchainService,
  ) {}

  private async readPayerTokenState(payerWallet: string): Promise<{
    balanceWei: bigint;
    allowanceWei: bigint;
    settlementAddress: string;
  } | null> {
    if (!this.blockchain.isEnabled) return null;

    const tokenAddressRaw = process.env.JPYC_TOKEN_ADDRESS?.trim();
    const settlementAddressRaw = process.env.SETTLEMENT_ADDRESS?.trim();
    if (!tokenAddressRaw || !settlementAddressRaw) return null;
    if (!ethers.isAddress(tokenAddressRaw) || !ethers.isAddress(settlementAddressRaw)) return null;

    const tokenAddress = ethers.getAddress(tokenAddressRaw);
    const settlementAddress = ethers.getAddress(settlementAddressRaw);
    const token = new ethers.Contract(
      tokenAddress,
      ERC20_BALANCE_ALLOWANCE_ABI,
      this.blockchain.provider,
    );

    const [balance, allowance] = await Promise.all([
      token.balanceOf(payerWallet),
      token.allowance(payerWallet, settlementAddress),
    ]);
    const balanceWei = typeof balance === 'bigint' ? balance : BigInt(balance.toString());
    const allowanceWei = typeof allowance === 'bigint' ? allowance : BigInt(allowance.toString());
    return { balanceWei, allowanceWei, settlementAddress };
  }

  private async assertPayerCanSettle(payerWallet: string, grossAmountWei: bigint): Promise<void> {
    const state = await this.readPayerTokenState(payerWallet);
    if (!state) return;

    if (state.allowanceWei < grossAmountWei) {
      throw new HttpException(
        {
          message: 'JPYC の利用許可額が不足しています。決済前に再承認してください。',
          errorCode: 'INSUFFICIENT_ALLOWANCE',
          requiredWei: grossAmountWei.toString(),
          allowanceWei: state.allowanceWei.toString(),
          settlementAddress: state.settlementAddress,
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    if (state.balanceWei < grossAmountWei) {
      throw new HttpException(
        {
          message: 'JPYC 残高が不足しています。',
          errorCode: 'INSUFFICIENT_BALANCE',
          requiredWei: grossAmountWei.toString(),
          balanceWei: state.balanceWei.toString(),
        },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  /**
   * payerWallet のなりすまし防止。
   * 利用権 NFT がオンチェーンに存在する場合、ownerOf(tokenId) と payerWallet の一致を必須にする。
   */
  private async assertPayerOwnsUsageRight(
    payerWallet: string,
    onchainTokenId: string | null | undefined,
  ): Promise<void> {
    if (!this.blockchain.isEnabled) return;
    if (!onchainTokenId || !/^\d+$/.test(onchainTokenId)) return;

    const usageRightAddress = process.env.USAGE_RIGHT_ADDRESS?.trim()
      ?? process.env.ACCESS_PASS_NFT_ADDRESS?.trim();
    if (!usageRightAddress || !ethers.isAddress(usageRightAddress)) return;

    const token = new ethers.Contract(usageRightAddress, ERC721_OWNER_OF_ABI, this.blockchain.provider);
    let ownerOnChain: string;
    try {
      ownerOnChain = await token.ownerOf(BigInt(onchainTokenId));
    } catch {
      return;
    }
    const normalizedOwner = this.requireWalletAddress(ownerOnChain, 'オンチェーン所有者');
    if (normalizedOwner.toLowerCase() !== payerWallet.toLowerCase()) {
      throw new HttpException(
        { message: '支払ウォレットが利用権のオンチェーン所有者と一致しません' },
        HttpStatus.FORBIDDEN,
      );
    }
  }

  private requireWalletAddress(wallet: string | null | undefined, label: string): string {
    const normalized = wallet?.trim() ?? '';
    if (!normalized || !ethers.isAddress(normalized) || normalized === ethers.ZeroAddress) {
      throw new HttpException(
        { message: `${label}ウォレットが未設定または不正です` },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    return ethers.getAddress(normalized);
  }

  private resolveFallbackTreasuryWallet(): string | null {
    const candidates = [
      DEFAULT_TREASURY_WALLET,
      process.env.PLATFORM_TREASURY,
      process.env.PLATFORM_FEE_RECIPIENT,
    ];
    for (const candidate of candidates) {
      const raw = candidate?.trim();
      if (!raw) continue;
      if (!ethers.isAddress(raw) || raw === ethers.ZeroAddress) continue;
      return ethers.getAddress(raw);
    }
    return null;
  }

  /**
   * 超過料金（minor）を計算する。
   * UI の暫定ルールと同一にし、計算差異を防ぐ。
   */
  private calculateOvertimeMinor(usedMinutes: number, baseDurationMinutes: number): number {
    const overtimeMinutes = Math.max(0, usedMinutes - baseDurationMinutes);
    if (overtimeMinutes <= 10) return 0;
    if (overtimeMinutes <= 30) return Math.ceil((overtimeMinutes - 10) / 10) * 10000;
    if (overtimeMinutes <= 60) return 20000 + Math.ceil((overtimeMinutes - 30) / 10) * 15000;
    // 60 分超は現状「自動パック切替」未実装のため、同一レートで継続課金する。
    return 20000 + Math.ceil((overtimeMinutes - 30) / 10) * 15000;
  }

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

  async endSession(
    sessionId: string,
    input?: {
      actorWalletAddress?: string;
      payerWallet?: string;
    },
  ) {
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

    const actorWallet = this.requireWalletAddress(
      input?.actorWalletAddress ?? session.user?.walletAddress,
      '実行者',
    );
    const sessionUserWallet = this.requireWalletAddress(
      session.user?.walletAddress,
      'セッション所有者',
    );
    if (actorWallet.toLowerCase() !== sessionUserWallet.toLowerCase()) {
      throw new HttpException(
        { message: 'このセッションのチェックアウト権限がありません' },
        HttpStatus.FORBIDDEN,
      );
    }
    const payerWallet = this.requireWalletAddress(
      input?.payerWallet ?? sessionUserWallet,
      '支払者',
    );

    let venueTreasury = session.venue?.merchant?.treasuryWallet?.trim() ?? '';
    if (!venueTreasury) {
      const fallbackTreasury = this.resolveFallbackTreasuryWallet();
      if (!fallbackTreasury) {
        throw new HttpException(
          { message: '店舗受取ウォレットが未設定です' },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      venueTreasury = fallbackTreasury;
      this.logger.warn(
        `[session.checkout] merchant treasury missing, fallback wallet is used venueId=${session.venueId} fallback=${fallbackTreasury}`,
      );

      await this.prisma.merchant.updateMany({
        where: {
          id: session.venue.merchantId,
          OR: [
            { treasuryWallet: null },
            { treasuryWallet: '' },
          ],
        },
        data: { treasuryWallet: fallbackTreasury },
      });
    }
    venueTreasury = this.requireWalletAddress(venueTreasury, '店舗受取');

    const checkedOutAt = new Date();
    const usedMinutes = session.checkedInAt
      ? Math.ceil((checkedOutAt.getTime() - session.checkedInAt.getTime()) / 60000)
      : 0;
    const rawPrice = session.usageRight?.usageProduct?.priceJpyc ?? '0';
    const baseDurationMinutes = Math.max(1, session.usageRight?.usageProduct?.durationMinutes ?? 60);
    const basePriceMinor = Number(rawPrice) * 100;
    const overtimeMinor = this.calculateOvertimeMinor(usedMinutes, baseDurationMinutes);
    const amenitiesMinor = 0;
    const damageMinor = 0;
    const grossMinor = Math.max(0, basePriceMinor + overtimeMinor + amenitiesMinor + damageMinor);

    const sessionRef = SettlementContractService.toReferenceId(sessionId);
    const machineRef = session.machineId
      ? SettlementContractService.toReferenceId(session.machineId)
      : '0x0000000000000000000000000000000000000000000000000000000000000000';
    const grossAmountWei = BigInt(grossMinor) * SessionService.WEI_PER_MINOR;
    await this.assertPayerOwnsUsageRight(payerWallet, session.usageRight?.onchainTokenId);
    await this.assertPayerCanSettle(payerWallet, grossAmountWei);

    this.logger.log(
      `[session.checkout] settle start sessionId=${sessionId} payer=${payerWallet} venueTreasury=${venueTreasury} amountWei=${grossAmountWei.toString()} usedMinutes=${usedMinutes} baseMinor=${basePriceMinor} overtimeMinor=${overtimeMinor}`,
    );
    const txHash = await this.settlement.settleUsage({
      sessionId: sessionRef,
      machineId: machineRef,
      payer: payerWallet,
      venueTreasury,
      grossAmount: grossAmountWei,
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
          amountJpyc: grossAmountWei.toString(),
          txHash,
          status: 'CONFIRMED',
          confirmedAt: new Date(),
        },
      });
      return updatedSession;
    });

    return {
      ...ended,
      usedMinutes,
      basePriceMinor,
      baseDurationMinutes,
      overtimeMinor,
      amenitiesMinor,
      damageMinor,
      totalMinor: grossMinor,
    };
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
