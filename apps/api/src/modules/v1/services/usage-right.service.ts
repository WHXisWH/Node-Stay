import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../../../prisma/prisma.service';
import { UsageRightContractService } from '../../../blockchain/usage-right.contract.service';
import { UserService } from './user.service';

@Injectable()
export class UsageRightService {
  private readonly logger = new Logger(UsageRightService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usageRightContract: UsageRightContractService,
    private readonly userService: UserService,
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

    // owner_user_id は users.id への FK のため、フロントから渡る walletAddress を userId に解決する
    // あわせて mint 先ウォレット（buyerWallet）も決定する。
    let ownerUserId: string | null = null;
    let resolvedBuyerWallet: string | null = null;
    if (input.ownerUserId) {
      const rawOwner = input.ownerUserId.trim();
      const isWallet = /^0x[0-9a-fA-F]{40}$/.test(rawOwner);
      if (isWallet) {
        ownerUserId = await this.userService.findOrCreateByWallet(rawOwner);
        resolvedBuyerWallet = rawOwner;
      } else {
        ownerUserId = await this.userService.resolveUserId({ userId: input.ownerUserId });
        if (!ownerUserId) ownerUserId = null;
        if (ownerUserId) {
          const owner = await this.prisma.user.findUnique({
            where: { id: ownerUserId },
            select: { walletAddress: true },
          });
          if (owner?.walletAddress && /^0x[0-9a-fA-F]{40}$/.test(owner.walletAddress)) {
            resolvedBuyerWallet = owner.walletAddress;
          }
        }
      }
    }

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
        ownerUserId,
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
    // buyerWallet が未指定でも owner 情報から解決できれば ZeroAddress を避ける。
    const buyerWallet = input.buyerWallet ?? resolvedBuyerWallet ?? ethers.ZeroAddress;
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
    const right = await this.prisma.usageRight.findUnique({
      where: { id: usageRightId },
      include: { usageProduct: true },
    });
    if (!right) return null;

    const venue = await this.prisma.venue.findUnique({
      where: { id: right.usageProduct.venueId },
      select: { id: true, name: true, address: true },
    });

    const sessions = await this.prisma.session.findMany({
      where: { usageRightId },
      select: { checkedInAt: true, checkedOutAt: true, status: true },
    });
    const now = new Date();
    let usedMinutes = 0;
    for (const s of sessions) {
      if (s.status === 'COMPLETED' && s.checkedInAt && s.checkedOutAt) {
        usedMinutes += Math.ceil((s.checkedOutAt.getTime() - s.checkedInAt.getTime()) / 60000);
      } else if (s.status === 'IN_USE' && s.checkedInAt) {
        usedMinutes += Math.ceil((now.getTime() - s.checkedInAt.getTime()) / 60000);
      }
    }
    const totalMinutes = right.usageProduct.durationMinutes ?? 0;
    const remainingMinutes = Math.max(0, totalMinutes - usedMinutes);

    return {
      ...right,
      remainingMinutes,
      usageProduct: {
        ...right.usageProduct,
        venue: venue
          ? { id: venue.id, name: venue.name, address: venue.address ?? '' }
          : { id: right.usageProduct.venueId, name: '店舗', address: '' },
      },
    };
  }

  async listByUser(input: { userId?: string; walletAddress?: string }) {
    const userId = await this.userService.resolveUserId(input);
    if (!userId) {
      // walletAddress からユーザーが特定できない場合は 404 相当を返す
      throw new HttpException(
        { message: 'ユーザーが見つかりません' },
        HttpStatus.NOT_FOUND,
      );
    }

    const rows = await this.prisma.usageRight.findMany({
      where: { ownerUserId: userId },
      include: {
        usageProduct: {
          select: {
            productName: true,
            usageType: true,
            priceJpyc: true,
            venueId: true,
            durationMinutes: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const usageRightIds = rows.map((r) => r.id);
    const sessions = await this.prisma.session.findMany({
      where: { usageRightId: { in: usageRightIds } },
      select: { usageRightId: true, checkedInAt: true, checkedOutAt: true, status: true },
    });

    const now = new Date();
    const usedMinutesByRight = new Map<string, number>();
    for (const s of sessions) {
      let used = 0;
      if (s.status === 'COMPLETED' && s.checkedInAt && s.checkedOutAt) {
        used = Math.ceil((s.checkedOutAt.getTime() - s.checkedInAt.getTime()) / 60000);
      } else if (s.status === 'IN_USE' && s.checkedInAt) {
        used = Math.ceil((now.getTime() - s.checkedInAt.getTime()) / 60000);
      }
      usedMinutesByRight.set(s.usageRightId, (usedMinutesByRight.get(s.usageRightId) ?? 0) + used);
    }

    const venueIds = [...new Set(rows.map((r) => r.usageProduct.venueId))];
    const venues = await this.prisma.venue.findMany({
      where: { id: { in: venueIds } },
      select: { id: true, name: true },
    });
    const venueMap = new Map(venues.map((v) => [v.id, v.name]));

    const listedRightIds = rows.filter((r) => r.status === 'LISTED').map((r) => r.id);
    const activeListings =
      listedRightIds.length > 0
        ? await this.prisma.usageListing.findMany({
            where: { usageRightId: { in: listedRightIds }, status: 'ACTIVE' },
            select: { usageRightId: true, id: true, onchainListingId: true },
          })
        : [];
    const listingByRightId = new Map(activeListings.map((l) => [l.usageRightId, l]));

    return rows.map((r) => {
      const totalMinutes = r.usageProduct.durationMinutes ?? 0;
      const usedMinutes = usedMinutesByRight.get(r.id) ?? 0;
      const remainingMinutes = Math.max(0, totalMinutes - usedMinutes);
      const listing = listingByRightId.get(r.id);
      return {
        ...r,
        remainingMinutes,
        ...(listing && { listingId: listing.id, onchainListingId: listing.onchainListingId }),
        usageProduct: {
          ...r.usageProduct,
          venue: {
            id: r.usageProduct.venueId,
            name: venueMap.get(r.usageProduct.venueId) ?? '店舗',
          },
        },
      };
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

    // ウォレットアドレスの場合は userId に解決（FK 制約のため）
    let ownerUserId = newOwnerUserId.trim();
    if (/^0x[0-9a-fA-F]{40}$/.test(ownerUserId)) {
      ownerUserId = await this.userService.findOrCreateByWallet(ownerUserId);
    }

    const updated = await this.prisma.usageRight.update({
      where: { id: usageRightId },
      data: {
        ownerUserId,
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
