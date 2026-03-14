import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../../../prisma/prisma.service';
import { UserService } from './user.service';
import { BlockchainService } from '../../../blockchain/blockchain.service';
import { FeatureFlagsService } from './featureFlags.service';

const MARKETPLACE_EVENTS = [
  'event Listed(uint256 indexed listingId, uint256 indexed tokenId, address indexed seller, uint256 priceJpyc)',
  'event Cancelled(uint256 indexed listingId, address indexed seller)',
  'event Purchased(uint256 indexed listingId, uint256 indexed tokenId, address indexed buyer, uint256 priceJpyc)',
] as const;

type ListedEvent = {
  listingId: string;
  tokenId: string;
  seller: string;
};

type CancelledEvent = {
  listingId: string;
  seller: string;
};

type PurchasedEvent = {
  listingId: string;
  tokenId: string;
  buyer: string;
};

@Injectable()
export class ListingService {
  private readonly logger = new Logger(ListingService.name);
  private readonly marketplaceIface = new ethers.Interface(MARKETPLACE_EVENTS);

  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
    private readonly blockchain: BlockchainService,
    private readonly flags: FeatureFlagsService,
  ) {}

  private async resolveExistingUserId(input: string): Promise<string> {
    const raw = input.trim();
    if (!raw) {
      throw new HttpException({ message: 'userIdが必須です' }, HttpStatus.BAD_REQUEST);
    }
    if (/^0x[0-9a-fA-F]{40}$/.test(raw)) {
      const id = await this.userService.resolveUserId({ walletAddress: raw });
      if (!id) {
        throw new HttpException({ message: 'ユーザーが見つかりません' }, HttpStatus.NOT_FOUND);
      }
      return id;
    }
    return raw;
  }

  private async resolveWalletAddressByUserId(userId: string, label: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { walletAddress: true },
    });
    const wallet = user?.walletAddress?.trim() ?? '';
    if (!wallet || !ethers.isAddress(wallet) || wallet === ethers.ZeroAddress) {
      throw new HttpException(
        { message: `${label}のウォレットアドレスが不正です` },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    return wallet.toLowerCase();
  }

  private normalizeWalletAddress(wallet: string, label: string): string {
    const normalized = wallet.trim();
    if (!normalized || !ethers.isAddress(normalized) || normalized === ethers.ZeroAddress) {
      throw new HttpException(
        { message: `${label}のウォレットアドレスが不正です` },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    return normalized.toLowerCase();
  }

  private async getMarketplaceReceiptOrThrow(txHash: string) {
    const normalized = txHash.trim();
    if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
      throw new HttpException({ message: 'txHashの形式が不正です' }, HttpStatus.BAD_REQUEST);
    }

    const marketplaceAddress = process.env.MARKETPLACE_ADDRESS?.trim();
    if (!marketplaceAddress || !ethers.isAddress(marketplaceAddress)) {
      throw new HttpException(
        { message: 'MARKETPLACE_ADDRESSが未設定です' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    if (!this.blockchain.isEnabled) {
      if (this.flags.strictOnchainModeEnabled()) {
        throw new HttpException(
          { message: 'ブロックチェーン接続が無効です' },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }
      this.logger.warn('[marketplace.verify] blockchain disabled, strict mode off');
      return { receipt: null, marketplaceAddress: marketplaceAddress.toLowerCase() };
    }

    const receipt = await this.blockchain.provider.getTransactionReceipt(normalized);
    if (!receipt || receipt.status !== 1) {
      throw new HttpException(
        { message: 'オンチェーン取引の確認に失敗しました' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    return { receipt, marketplaceAddress: marketplaceAddress.toLowerCase() };
  }

  private async extractListedEvent(
    txHash: string,
    expected: { tokenId: string; sellerWallet: string },
  ): Promise<ListedEvent> {
    const { receipt, marketplaceAddress } = await this.getMarketplaceReceiptOrThrow(txHash);
    if (!receipt) {
      throw new HttpException(
        { message: 'オンチェーン検証がスキップされました' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== marketplaceAddress) continue;
      let parsed: ethers.LogDescription | null = null;
      try {
        parsed = this.marketplaceIface.parseLog(log);
      } catch {
        parsed = null;
      }
      if (!parsed || parsed.name !== 'Listed') continue;

      const listingId = (parsed.args.listingId as bigint).toString();
      const tokenId = (parsed.args.tokenId as bigint).toString();
      const seller = String(parsed.args.seller).toLowerCase();
      if (tokenId !== expected.tokenId) continue;
      if (seller !== expected.sellerWallet.toLowerCase()) continue;
      return { listingId, tokenId, seller };
    }

    throw new HttpException(
      { message: 'Listedイベントが見つかりません' },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }

  private async extractCancelledEvent(
    txHash: string,
    expected: { listingId: string; sellerWallet: string },
  ): Promise<CancelledEvent> {
    const { receipt, marketplaceAddress } = await this.getMarketplaceReceiptOrThrow(txHash);
    if (!receipt) {
      throw new HttpException(
        { message: 'オンチェーン検証がスキップされました' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== marketplaceAddress) continue;
      let parsed: ethers.LogDescription | null = null;
      try {
        parsed = this.marketplaceIface.parseLog(log);
      } catch {
        parsed = null;
      }
      if (!parsed || parsed.name !== 'Cancelled') continue;

      const listingId = (parsed.args.listingId as bigint).toString();
      const seller = String(parsed.args.seller).toLowerCase();
      if (listingId !== expected.listingId) continue;
      if (seller !== expected.sellerWallet.toLowerCase()) continue;
      return { listingId, seller };
    }

    throw new HttpException(
      { message: 'Cancelledイベントが見つかりません' },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }

  private async extractPurchasedEvent(
    txHash: string,
    expected: { listingId: string; buyerWallet: string },
  ): Promise<PurchasedEvent> {
    const { receipt, marketplaceAddress } = await this.getMarketplaceReceiptOrThrow(txHash);
    if (!receipt) {
      throw new HttpException(
        { message: 'オンチェーン検証がスキップされました' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== marketplaceAddress) continue;
      let parsed: ethers.LogDescription | null = null;
      try {
        parsed = this.marketplaceIface.parseLog(log);
      } catch {
        parsed = null;
      }
      if (!parsed || parsed.name !== 'Purchased') continue;

      const listingId = (parsed.args.listingId as bigint).toString();
      const tokenId = (parsed.args.tokenId as bigint).toString();
      const buyer = String(parsed.args.buyer).toLowerCase();
      if (listingId !== expected.listingId) continue;
      if (buyer !== expected.buyerWallet.toLowerCase()) continue;
      return { listingId, tokenId, buyer };
    }

    throw new HttpException(
      { message: 'Purchasedイベントが見つかりません' },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }

  async createListing(input: {
    usageRightId: string;
    sellerUserId: string;
    priceJpyc: string;
    expiryAt?: Date;
    onchainTxHash: string;
  }) {
    const sellerUserId = await this.resolveExistingUserId(input.sellerUserId);
    const sellerWallet = await this.resolveWalletAddressByUserId(sellerUserId, '出品者');
    const existingByTx = await this.prisma.usageListing.findFirst({
      where: { onchainTxHash: input.onchainTxHash },
    });
    if (existingByTx) return existingByTx;

    const usageRight = await this.prisma.usageRight.findUnique({
      where: { id: input.usageRightId },
    });
    if (!usageRight) {
      throw new HttpException({ message: '利用権が見つかりません' }, HttpStatus.BAD_REQUEST);
    }
    if (usageRight.status !== 'MINTED') {
      throw new HttpException(
        { message: 'この利用権は出品可能な状態ではありません' },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (usageRight.ownerUserId !== sellerUserId) {
      throw new HttpException(
        { message: 'この利用権の所有者ではありません' },
        HttpStatus.FORBIDDEN,
      );
    }
    if (!usageRight.transferable) {
      throw new HttpException(
        { message: 'この利用権は譲渡不可のため出品できません' },
        HttpStatus.FORBIDDEN,
      );
    }
    if (!usageRight.onchainTokenId) {
      throw new HttpException(
        { message: 'オンチェーンToken IDが未設定です' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const listedEvent = await this.extractListedEvent(input.onchainTxHash, {
      tokenId: usageRight.onchainTokenId,
      sellerWallet,
    });

    this.logger.log(
      `[marketplace.create] verified listed listingId=${listedEvent.listingId} tokenId=${listedEvent.tokenId} txHash=${input.onchainTxHash}`,
    );

    return this.prisma.$transaction(async (tx) => {
      const alreadyActive = await tx.usageListing.findFirst({
        where: { usageRightId: input.usageRightId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (alreadyActive) {
        throw new HttpException(
          { message: '既にアクティブな出品があります' },
          HttpStatus.CONFLICT,
        );
      }

      const switched = await tx.usageRight.updateMany({
        where: {
          id: input.usageRightId,
          status: 'MINTED',
          ownerUserId: sellerUserId,
          transferable: true,
        },
        data: { status: 'LISTED' },
      });
      if (switched.count !== 1) {
        throw new HttpException(
          { message: '出品準備の更新に失敗しました' },
          HttpStatus.CONFLICT,
        );
      }

      return tx.usageListing.create({
        data: {
          usageRightId: input.usageRightId,
          sellerUserId,
          priceJpyc: input.priceJpyc,
          expiryAt: input.expiryAt ?? null,
          status: 'ACTIVE',
          onchainListingId: listedEvent.listingId,
          onchainTxHash: input.onchainTxHash,
        },
      });
    });
  }

  async cancelListing(listingId: string, userId: string, input: { onchainTxHash: string }) {
    const sellerUserId = await this.resolveExistingUserId(userId);
    const sellerWallet = await this.resolveWalletAddressByUserId(sellerUserId, '出品者');

    return this.prisma.$transaction(async (tx) => {
      const listing = await tx.usageListing.findUnique({
        where: { id: listingId },
        select: { id: true, usageRightId: true, sellerUserId: true, status: true, onchainListingId: true },
      });
      if (!listing) {
        throw new HttpException({ message: 'リスティングが見つかりません' }, HttpStatus.NOT_FOUND);
      }
      if (listing.sellerUserId !== sellerUserId) {
        throw new HttpException({ message: 'この出品のキャンセル権限がありません' }, HttpStatus.FORBIDDEN);
      }
      if (!listing.onchainListingId) {
        throw new HttpException(
          { message: 'オンチェーンListing IDが未設定です' },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      await this.extractCancelledEvent(input.onchainTxHash, {
        listingId: listing.onchainListingId,
        sellerWallet,
      });

      this.logger.log(
        `[marketplace.cancel] verified listingId=${listing.onchainListingId} txHash=${input.onchainTxHash}`,
      );

      const cancelled = await tx.usageListing.updateMany({
        where: { id: listingId, sellerUserId, status: 'ACTIVE' },
        data: { status: 'CANCELLED', onchainTxHash: input.onchainTxHash },
      });
      if (cancelled.count !== 1) {
        throw new HttpException(
          { message: 'アクティブな出品のみキャンセルできます' },
          HttpStatus.CONFLICT,
        );
      }

      await tx.usageRight.updateMany({
        where: { id: listing.usageRightId, status: 'LISTED' },
        data: { status: 'MINTED' },
      });

      return {
        id: listing.id,
        usageRightId: listing.usageRightId,
        sellerUserId: listing.sellerUserId,
        status: 'CANCELLED',
      };
    });
  }

  async buyListing(
    listingId: string,
    buyerUserId: string,
    input: { onchainTxHash: string; buyerWallet?: string },
  ) {
    let buyerId = buyerUserId.trim();
    if (/^0x[0-9a-fA-F]{40}$/.test(buyerId)) {
      buyerId = await this.userService.findOrCreateByWallet(buyerId);
    }
    const buyerWallet = input.buyerWallet?.trim()
      ? this.normalizeWalletAddress(input.buyerWallet, '購入者')
      : await this.resolveWalletAddressByUserId(buyerId, '購入者');

    return this.prisma.$transaction(async (tx) => {
      const listing = await tx.usageListing.findUnique({
        where: { id: listingId },
        select: {
          id: true,
          usageRightId: true,
          sellerUserId: true,
          status: true,
          onchainListingId: true,
        },
      });
      if (!listing) {
        throw new HttpException({ message: 'リスティングが見つかりません' }, HttpStatus.NOT_FOUND);
      }
      if (listing.sellerUserId === buyerId) {
        throw new HttpException({ message: '自分のリスティングは購入できません' }, HttpStatus.BAD_REQUEST);
      }
      if (!listing.onchainListingId) {
        throw new HttpException(
          { message: 'オンチェーンListing IDが未設定です' },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      await this.extractPurchasedEvent(input.onchainTxHash, {
        listingId: listing.onchainListingId,
        buyerWallet,
      });
      this.logger.log(
        `[marketplace.buy] verified listingId=${listing.onchainListingId} buyer=${buyerWallet} txHash=${input.onchainTxHash}`,
      );

      const soldAt = new Date();
      const sold = await tx.usageListing.updateMany({
        where: { id: listingId, status: 'ACTIVE', sellerUserId: { not: buyerId } },
        data: {
          status: 'SOLD',
          buyerUserId: buyerId,
          soldAt,
          onchainTxHash: input.onchainTxHash,
        },
      });
      if (sold.count !== 1) {
        throw new HttpException(
          { message: 'アクティブな出品のみ購入できます' },
          HttpStatus.CONFLICT,
        );
      }

      await tx.usageRight.updateMany({
        where: { id: listing.usageRightId, status: 'LISTED' },
        data: {
          ownerUserId: buyerId,
          status: 'MINTED',
          transferCount: { increment: 1 },
        },
      });

      return {
        id: listing.id,
        usageRightId: listing.usageRightId,
        sellerUserId: listing.sellerUserId,
        buyerUserId: buyerId,
        status: 'SOLD',
        soldAt,
      };
    });
  }

  async listActiveListings(params?: {
    venueId?: string;
    minPriceJpyc?: string;
    maxPriceJpyc?: string;
  }) {
    const minPrice = params?.minPriceJpyc ? Number(params.minPriceJpyc) : null;
    const maxPrice = params?.maxPriceJpyc ? Number(params.maxPriceJpyc) : null;

    const rows = await this.prisma.usageListing.findMany({
      where: {
        status: 'ACTIVE',
        ...(params?.venueId
          ? {
              usageRight: {
                usageProduct: { venueId: params.venueId },
              },
            }
          : {}),
      },
      include: {
        usageRight: {
          include: {
            usageProduct: true,
          },
        },
        seller: { select: { walletAddress: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const filteredRows =
      minPrice != null && !Number.isNaN(minPrice)
        ? rows.filter((r) => Number(r.priceJpyc) >= minPrice)
        : rows;
    const priceFilteredRows =
      maxPrice != null && !Number.isNaN(maxPrice)
        ? filteredRows.filter((r) => Number(r.priceJpyc) <= maxPrice)
        : filteredRows;

    const venueIds = [...new Set(priceFilteredRows.map((r) => r.usageRight.usageProduct.venueId))];
    const venues = await this.prisma.venue.findMany({
      where: { id: { in: venueIds } },
      select: { id: true, name: true },
    });
    const venueMap = new Map(venues.map((v) => [v.id, v.name]));

    return priceFilteredRows.map((r) => ({
      ...r,
      venueName: venueMap.get(r.usageRight.usageProduct.venueId) ?? '店舗',
      sellerWalletAddress: r.seller?.walletAddress ?? null,
    }));
  }

  async getListingById(listingId: string) {
    return this.prisma.usageListing.findUnique({
      where: { id: listingId },
      include: {
        usageRight: {
          include: {
            usageProduct: true,
          },
        },
      },
    });
  }
}
