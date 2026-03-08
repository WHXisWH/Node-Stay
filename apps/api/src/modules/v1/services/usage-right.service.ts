import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../../../prisma/prisma.service';
import { UsageRightContractService } from '../../../blockchain/usage-right.contract.service';

@Injectable()
export class UsageRightService {
  private readonly logger = new Logger(UsageRightService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usageRightContract: UsageRightContractService,
  ) {}

  async purchase(input: {
    ownerUserId: string | null;
    productId: string;
    buyerWallet?: string;   // ミント先ウォレットアドレス（省略時は ZeroAddress）
  }) {
    // usageProduct と紐づく machine を一括取得（machineId 解決に利用）
    const product = await this.prisma.usageProduct.findUnique({
      where: { id: input.productId },
      include: { machine: true },
    });
    if (!product) return null;

    const now = new Date();
    const durationMs = (product.durationMinutes ?? 60) * 60 * 1000;
    const startAt = now;
    const endAt = new Date(now.getTime() + durationMs);
    // 転送締切: durationMinutes の前半で打ち切り（デフォルト: transferCutoffMinutes 分前）
    const cutoffMs = product.transferCutoffMinutes * 60 * 1000;
    const transferCutoffAt = new Date(startAt.getTime() + Math.max(durationMs - cutoffMs, 0));

    const right = await this.prisma.usageRight.create({
      data: {
        usageProductId: input.productId,
        ownerUserId: input.ownerUserId,
        startAt,
        endAt,
        status: 'MINTED',
        transferable: product.transferable,
        maxTransferCount: product.maxTransferCount,
        transferCutoffAt,
        kycLevelRequired: product.kycLevelRequired,
      },
    });

    // オンチェーン mint を非同期で試みる（失敗してもオフライン動作を継続）
    const buyerWallet = input.buyerWallet ?? ethers.ZeroAddress;
    this.usageRightContract.mintUsageRight({
      to: buyerWallet,
      machineId: product.machine?.machineId ?? ethers.ZeroHash,
      machinePoolId: ethers.ZeroHash,
      startAt: BigInt(Math.floor(startAt.getTime() / 1000)),
      endAt: BigInt(Math.floor(endAt.getTime() / 1000)),
      usageType: 0,
      transferable: product.transferable,
      transferCutoff: BigInt(Math.floor(transferCutoffAt.getTime() / 1000)),
      maxTransferCount: product.maxTransferCount,
      kycLevelRequired: product.kycLevelRequired,
      metadataUri: '',
    }).then((result) => {
      if (result) {
        this.logger.log(`mintUsageRight 成功: rightId=${right.id} txHash=${result.txHash}`);
        // オンチェーン txHash と tokenId を DB に書き戻す
        return this.prisma.usageRight.update({
          where: { id: right.id },
          data: { onchainTxHash: result.txHash, onchainTokenId: result.tokenId.toString() },
        });
      }
    }).catch((e) => this.logger.error(`mintUsageRight 後処理失敗: ${e}`));

    // DB レコードを即時返却（onchainTxHash は未確定の場合あり）
    return right;
  }

  /**
   * 利用権を ID で取得（転送バリデーション用）
   * transferable / transferCount / maxTransferCount / transferCutoffAt を含む
   */
  async findById(id: string) {
    return this.prisma.usageRight.findUnique({
      where: { id },
      include: { usageProduct: true },
    });
  }

  async getRight(usageRightId: string) {
    return this.prisma.usageRight.findUnique({
      where: { id: usageRightId },
      include: { usageProduct: true },
    });
  }

  async listByUser(userId: string) {
    return this.prisma.usageRight.findMany({
      where: { ownerUserId: userId },
      include: {
        usageProduct: {
          select: { productName: true, usageType: true, priceJpyc: true, venueId: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async cancel(usageRightId: string) {
    const right = await this.prisma.usageRight.findUnique({
      where: { id: usageRightId },
    });
    if (!right) return null;
    // MINTED / LISTED 状態のみキャンセル可能
    if (!['MINTED', 'LISTED'].includes(right.status)) return null;

    const cancelled = await this.prisma.usageRight.update({
      where: { id: usageRightId },
      data: { status: 'CANCELLED' },
    });

    // オンチェーン tokenId が存在する場合のみキャンセルトランザクションを発行
    if (right.onchainTokenId) {
      const tokenId = BigInt(right.onchainTokenId);
      this.usageRightContract.cancelUsageRight(tokenId)
        .then((txHash) => {
          if (txHash) {
            this.logger.log(`cancelUsageRight 成功: rightId=${right.id} txHash=${txHash}`);
          }
        })
        .catch((e) => this.logger.error(`cancelUsageRight 後処理失敗: ${e}`));
    }

    return cancelled;
  }

  async transfer(usageRightId: string, newOwnerUserId: string) {
    const right = await this.prisma.usageRight.findUnique({
      where: { id: usageRightId },
    });
    if (!right) return null;
    if (!right.transferable) return null;
    if (right.status !== 'MINTED') return null;
    if (right.transferCount >= right.maxTransferCount) return null;
    if (right.transferCutoffAt && new Date() > right.transferCutoffAt) return null;

    const updated = await this.prisma.usageRight.update({
      where: { id: usageRightId },
      data: {
        ownerUserId: newOwnerUserId,
        transferCount: { increment: 1 },
      },
    });

    // オンチェーン tokenId が存在する場合のみ転送トランザクションを発行
    if (right.onchainTokenId) {
      const tokenId = BigInt(right.onchainTokenId);
      // from は現オーナー（ウォレット未取得のため ZeroAddress をフォールバックとして使用）
      this.usageRightContract.transferUsageRight(ethers.ZeroAddress, ethers.ZeroAddress, tokenId)
        .then((txHash) => {
          if (txHash) {
            this.logger.log(`transferUsageRight 成功: rightId=${right.id} txHash=${txHash}`);
          }
        })
        .catch((e) => this.logger.error(`transferUsageRight 後処理失敗: ${e}`));
    }

    return updated;
  }
}
