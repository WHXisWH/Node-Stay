import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../../../prisma/prisma.service';
import { UsageRightContractService } from '../../../blockchain/usage-right.contract.service';
import { BlockchainService } from '../../../blockchain/blockchain.service';
import { UserService } from './user.service';

@Injectable()
export class UsageRightService {
  private readonly logger = new Logger(UsageRightService.name);
  private readonly usageRightIface = new ethers.Interface([
    'event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)',
  ]);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usageRightContract: UsageRightContractService,
    private readonly blockchain: BlockchainService,
    private readonly userService: UserService,
  ) {}

  private requireWalletAddress(wallet: string | null | undefined, label: string): string {
    const normalized = wallet?.trim() ?? '';
    if (!normalized || !ethers.isAddress(normalized) || normalized === ethers.ZeroAddress) {
      throw new HttpException(
        { message: `${label}のウォレットアドレスが不正です` },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    return normalized;
  }

  private normalizeTxHash(txHash: string): string {
    const normalized = txHash.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
      throw new HttpException(
        { message: 'onchainTxHash の形式が不正です' },
        HttpStatus.BAD_REQUEST,
      );
    }
    return normalized;
  }

  private async getReceiptWithRetry(
    txHash: string,
    opts?: { attempts?: number; intervalMs?: number },
  ): Promise<ethers.TransactionReceipt | null> {
    if (!this.blockchain.isEnabled) return null;
    const attempts = opts?.attempts ?? 12;
    const intervalMs = opts?.intervalMs ?? 1000;
    for (let i = 0; i < attempts; i += 1) {
      const receipt = await this.blockchain.provider.getTransactionReceipt(txHash);
      if (receipt) return receipt;
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }
    return null;
  }

  private async verifyTransferEventOrThrow(input: {
    txHash: string;
    tokenId: string;
    fromWallet: string;
    toWallet: string;
  }): Promise<string> {
    const normalizedTxHash = this.normalizeTxHash(input.txHash);
    const contractAddress = process.env.USAGE_RIGHT_ADDRESS ?? process.env.ACCESS_PASS_NFT_ADDRESS;
    if (!contractAddress || !ethers.isAddress(contractAddress)) {
      throw new HttpException(
        { message: 'USAGE_RIGHT_ADDRESS が未設定です' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (!this.blockchain.isEnabled) {
      throw new HttpException(
        { message: 'ブロックチェーン接続が無効です' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const receipt = await this.getReceiptWithRetry(normalizedTxHash);
    if (!receipt || receipt.status !== 1) {
      throw new HttpException(
        { message: 'オンチェーン取引の確認に失敗しました' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const expectedTokenId = input.tokenId;
    const expectedFrom = input.fromWallet.toLowerCase();
    const expectedTo = input.toWallet.toLowerCase();
    const expectedContract = contractAddress.toLowerCase();

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== expectedContract) continue;

      let parsed: ethers.LogDescription | null = null;
      try {
        parsed = this.usageRightIface.parseLog(log);
      } catch {
        parsed = null;
      }
      if (!parsed || parsed.name !== 'Transfer') continue;

      const from = String(parsed.args.from).toLowerCase();
      const to = String(parsed.args.to).toLowerCase();
      const tokenId = (parsed.args.tokenId as bigint).toString();
      if (from === expectedFrom && to === expectedTo && tokenId === expectedTokenId) {
        return normalizedTxHash;
      }
    }

    throw new HttpException(
      { message: 'Transferイベントが見つかりません' },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }

  async purchase(input: {
    ownerUserId: string | null;
    productId: string;
    buyerWallet?: string;
  }) {
    const product = await this.prisma.usageProduct.findUnique({
      where: { id: input.productId },
      include: { machine: true },
    });
    if (!product) return null;

    let ownerUserId: string | null = null;
    let resolvedBuyerWallet: string | null = null;
    if (input.ownerUserId) {
      const rawOwner = input.ownerUserId.trim();
      if (/^0x[0-9a-fA-F]{40}$/.test(rawOwner)) {
        ownerUserId = await this.userService.findOrCreateByWallet(rawOwner);
        resolvedBuyerWallet = rawOwner;
      } else {
        ownerUserId = await this.userService.resolveUserId({ userId: rawOwner });
        if (ownerUserId) {
          const owner = await this.prisma.user.findUnique({
            where: { id: ownerUserId },
            select: { walletAddress: true },
          });
          resolvedBuyerWallet = owner?.walletAddress ?? null;
        }
      }
    }

    const now = new Date();
    const durationMs = (product.durationMinutes ?? 60) * 60 * 1000;
    const startAt = now;
    const endAt = new Date(now.getTime() + durationMs);
    const cutoffMs = product.transferCutoffMinutes * 60 * 1000;
    const transferCutoffAt = new Date(startAt.getTime() + Math.max(durationMs - cutoffMs, 0));
    const buyerWallet = this.requireWalletAddress(
      input.buyerWallet ?? resolvedBuyerWallet,
      '購入者',
    );

    this.logger.log(
      `[usage-right.purchase] start productId=${input.productId} ownerUserId=${ownerUserId ?? 'null'} buyerWallet=${buyerWallet}`,
    );

    const onchain = await this.usageRightContract.mintUsageRight({
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
    });
    if (!onchain) {
      this.logger.error(
        `[usage-right.purchase] onchain mint failed productId=${input.productId} buyerWallet=${buyerWallet}`,
      );
      throw new HttpException(
        { message: 'オンチェーン発行に失敗しました' },
        HttpStatus.BAD_GATEWAY,
      );
    }

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
        onchainTokenId: onchain.tokenId.toString(),
        onchainTxHash: onchain.txHash,
      },
    });

    this.logger.log(
      `[usage-right.purchase] done rightId=${right.id} tokenId=${onchain.tokenId.toString()} txHash=${onchain.txHash}`,
    );
    return right;
  }

  /**
   * 利用権を ID で取得する。
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
    if (!['MINTED', 'LISTED'].includes(right.status)) return null;

    if (!right.onchainTokenId) {
      this.logger.warn(`[usage-right.cancel] tokenId missing rightId=${right.id}`);
      throw new HttpException(
        { message: 'オンチェーンToken IDが未設定です' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const tokenId = BigInt(right.onchainTokenId);
    this.logger.log(`[usage-right.cancel] start rightId=${right.id} tokenId=${tokenId.toString()}`);
    const txHash = await this.usageRightContract.cancelUsageRight(tokenId);
    if (!txHash) {
      this.logger.error(`[usage-right.cancel] onchain cancel failed rightId=${right.id}`);
      throw new HttpException(
        { message: 'オンチェーン取消に失敗しました' },
        HttpStatus.BAD_GATEWAY,
      );
    }
    this.logger.log(`[usage-right.cancel] onchain done rightId=${right.id} txHash=${txHash}`);

    return this.prisma.usageRight.update({
      where: { id: usageRightId },
      data: { status: 'CANCELLED' },
    });
  }

  async transfer(
    usageRightId: string,
    newOwnerUserId: string,
    onchainTxHash: string,
    actorWalletAddress: string,
    fromWalletAddress?: string,
  ) {
    const right = await this.prisma.usageRight.findUnique({
      where: { id: usageRightId },
    });
    if (!right) return null;
    if (!right.transferable) return null;
    if (right.status !== 'MINTED') return null;
    if (right.transferCount >= right.maxTransferCount) return null;
    if (right.transferCutoffAt && new Date() > right.transferCutoffAt) return null;
    if (!right.ownerUserId) {
      throw new HttpException(
        { message: '現在所有者が未設定です' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (!right.onchainTokenId) {
      throw new HttpException(
        { message: 'オンチェーンToken IDが未設定です' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    let ownerUserId = newOwnerUserId.trim();
    if (/^0x[0-9a-fA-F]{40}$/.test(ownerUserId)) {
      ownerUserId = await this.userService.findOrCreateByWallet(ownerUserId);
    }

    const [actorUserId, currentOwner, nextOwner] = await Promise.all([
      this.userService.resolveUserId({ walletAddress: actorWalletAddress }),
      this.prisma.user.findUnique({
        where: { id: right.ownerUserId },
        select: { walletAddress: true },
      }),
      this.prisma.user.findUnique({
        where: { id: ownerUserId },
        select: { walletAddress: true },
      }),
    ]);
    if (!actorUserId || actorUserId !== right.ownerUserId) {
      throw new HttpException(
        { message: 'この利用権の譲渡権限がありません' },
        HttpStatus.FORBIDDEN,
      );
    }
    const fromWallet = this.requireWalletAddress(
      fromWalletAddress ?? currentOwner?.walletAddress,
      '現在所有者',
    );
    const toWallet = this.requireWalletAddress(nextOwner?.walletAddress, '新しい所有者');
    const tokenId = BigInt(right.onchainTokenId);
    if (fromWallet.toLowerCase() === toWallet.toLowerCase()) {
      throw new HttpException(
        { message: '譲渡先ウォレットが現在所有者と同一です' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    this.logger.log(
      `[usage-right.transfer] verify start rightId=${right.id} tokenId=${tokenId.toString()} from=${fromWallet} to=${toWallet} txHash=${onchainTxHash}`,
    );
    const txHash = await this.verifyTransferEventOrThrow({
      txHash: onchainTxHash,
      tokenId: tokenId.toString(),
      fromWallet,
      toWallet,
    });
    this.logger.log(`[usage-right.transfer] verify done rightId=${right.id} txHash=${txHash}`);

    return this.prisma.usageRight.update({
      where: { id: usageRightId },
      data: {
        ownerUserId,
        transferCount: { increment: 1 },
        status: 'MINTED',
        onchainTxHash: txHash,
      },
    });
  }
}
