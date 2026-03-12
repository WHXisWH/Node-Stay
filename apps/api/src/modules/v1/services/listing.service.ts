import { Injectable } from '@nestjs/common';
import { HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { UserService } from './user.service';

// -----------------------------------------------------------------------
// リスティングサービス
// マーケットプレイス上の利用権出品・売買ロジックを管理する
// -----------------------------------------------------------------------

@Injectable()
export class ListingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
  ) {}

  private async resolveExistingUserId(input: string): Promise<string> {
    const raw = input.trim();
    if (!raw) {
      throw new HttpException({ message: 'userId が必要です' }, HttpStatus.BAD_REQUEST);
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

  // -----------------------------------------------------------------------
  // 利用権をマーケットプレイスに出品する
  // sellerUserId は UUID またはウォレットアドレス（0x...）可。アドレスの場合は findOrCreateByWallet で解決
  // -----------------------------------------------------------------------
  async createListing(input: {
    usageRightId: string;
    sellerUserId: string;
    priceJpyc: string;
    expiryAt?: Date;
  }) {
    const sellerUserId = await this.resolveExistingUserId(input.sellerUserId);

    return this.prisma.$transaction(async (tx) => {
      const usageRight = await tx.usageRight.findUnique({
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
        throw new HttpException({ message: 'この利用権の所有者ではありません' }, HttpStatus.FORBIDDEN);
      }
      if (!usageRight.transferable) {
        throw new HttpException({ message: 'この利用権は譲渡不可のため出品できません' }, HttpStatus.FORBIDDEN);
      }

      const alreadyActive = await tx.usageListing.findFirst({
        where: { usageRightId: input.usageRightId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (alreadyActive) {
        throw new HttpException({ message: '既にアクティブな出品があります' }, HttpStatus.CONFLICT);
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
        throw new HttpException({ message: '出品状態への更新に失敗しました' }, HttpStatus.CONFLICT);
      }

      return tx.usageListing.create({
        data: {
          usageRightId: input.usageRightId,
          sellerUserId,
          priceJpyc: input.priceJpyc,
          expiryAt: input.expiryAt ?? null,
          status: 'ACTIVE',
        },
      });
    });
  }

  // -----------------------------------------------------------------------
  // 出品をキャンセルする
  // userId は UUID またはウォレットアドレス（0x...）可
  // -----------------------------------------------------------------------
  async cancelListing(listingId: string, userId: string) {
    const sellerUserId = await this.resolveExistingUserId(userId);

    return this.prisma.$transaction(async (tx) => {
      const listing = await tx.usageListing.findUnique({
        where: { id: listingId },
        select: { id: true, usageRightId: true, sellerUserId: true, status: true },
      });
      if (!listing) {
        throw new HttpException({ message: 'リスティングが見つかりません' }, HttpStatus.NOT_FOUND);
      }
      if (listing.sellerUserId !== sellerUserId) {
        throw new HttpException({ message: 'この出品のキャンセル権限がありません' }, HttpStatus.FORBIDDEN);
      }

      const cancelled = await tx.usageListing.updateMany({
        where: { id: listingId, sellerUserId, status: 'ACTIVE' },
        data: { status: 'CANCELLED' },
      });
      if (cancelled.count !== 1) {
        throw new HttpException({ message: 'アクティブな出品のみキャンセルできます' }, HttpStatus.CONFLICT);
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

  // -----------------------------------------------------------------------
  // 出品を購入する（トランザクション処理）
  // buyerUserId は UUID またはウォレットアドレス（0x...）可
  // -----------------------------------------------------------------------
  async buyListing(listingId: string, buyerUserId: string) {
    let buyerId = buyerUserId.trim();
    if (/^0x[0-9a-fA-F]{40}$/.test(buyerId)) {
      buyerId = await this.userService.findOrCreateByWallet(buyerId);
    }

    return this.prisma.$transaction(async (tx) => {
      const listing = await tx.usageListing.findUnique({
        where: { id: listingId },
        select: { id: true, usageRightId: true, sellerUserId: true, status: true },
      });
      if (!listing) {
        throw new HttpException({ message: 'リスティングが見つかりません' }, HttpStatus.NOT_FOUND);
      }
      if (listing.sellerUserId === buyerId) {
        throw new HttpException({ message: '自分のリスティングは購入できません' }, HttpStatus.BAD_REQUEST);
      }

      const soldAt = new Date();
      const sold = await tx.usageListing.updateMany({
        where: { id: listingId, status: 'ACTIVE', sellerUserId: { not: buyerId } },
        data: {
          status: 'SOLD',
          buyerUserId: buyerId,
          soldAt,
        },
      });
      if (sold.count !== 1) {
        throw new HttpException({ message: 'アクティブな出品のみ購入できます' }, HttpStatus.CONFLICT);
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

  // -----------------------------------------------------------------------
  // アクティブな出品一覧を取得する
  // -----------------------------------------------------------------------
  async listActiveListings(params?: {
    venueId?: string;
    minPriceJpyc?: string;
    maxPriceJpyc?: string;
  }) {
    // priceJpyc は DB 上 String のため、数値フィルタは取得後にメモリで適用する（文字列比較は "9" > "10" になるため）
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

    // 価格を数値でフィルタ（NaN の場合は無視）
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

  // -----------------------------------------------------------------------
  // リスティングを ID で取得する
  // -----------------------------------------------------------------------
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
