import { Injectable } from '@nestjs/common';
import { HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

// -----------------------------------------------------------------------
// リスティングサービス
// マーケットプレイス上の利用権出品・売買ロジックを管理する
// -----------------------------------------------------------------------

@Injectable()
export class ListingService {
  constructor(private readonly prisma: PrismaService) {}

  // -----------------------------------------------------------------------
  // 利用権をマーケットプレイスに出品する
  // -----------------------------------------------------------------------
  async createListing(input: {
    usageRightId: string;
    sellerUserId: string;
    priceJpyc: string;
    expiryAt?: Date;
  }) {
    // 利用権の存在確認
    const usageRight = await this.prisma.usageRight.findUnique({
      where: { id: input.usageRightId },
    });
    if (!usageRight) {
      throw new HttpException({ message: '利用権が見つかりません' }, HttpStatus.BAD_REQUEST);
    }

    // MINTED 状態のみ出品可能
    if (usageRight.status !== 'MINTED') {
      throw new HttpException({ message: '利用権が MINTED 状態ではないため出品できません' }, HttpStatus.BAD_REQUEST);
    }

    // 所有者確認
    if (usageRight.ownerUserId !== input.sellerUserId) {
      throw new HttpException({ message: 'この利用権の所有者ではありません' }, HttpStatus.FORBIDDEN);
    }

    // 譲渡可能フラグ確認
    if (!usageRight.transferable) {
      throw new HttpException({ message: 'この利用権は譲渡不可のため出品できません' }, HttpStatus.FORBIDDEN);
    }

    // リスティングを作成する
    const listing = await this.prisma.usageListing.create({
      data: {
        usageRightId: input.usageRightId,
        sellerUserId: input.sellerUserId,
        priceJpyc: input.priceJpyc,
        expiryAt: input.expiryAt ?? null,
        status: 'ACTIVE',
      },
    });

    // 利用権のステータスを LISTED に更新する
    await this.prisma.usageRight.update({
      where: { id: input.usageRightId },
      data: { status: 'LISTED' },
    });

    return listing;
  }

  // -----------------------------------------------------------------------
  // 出品をキャンセルする
  // -----------------------------------------------------------------------
  async cancelListing(listingId: string, userId: string) {
    // リスティングの存在確認
    const listing = await this.prisma.usageListing.findUnique({
      where: { id: listingId },
    });
    if (!listing) {
      throw new HttpException({ message: 'リスティングが見つかりません' }, HttpStatus.NOT_FOUND);
    }

    // 出品者本人かどうか確認
    if (listing.sellerUserId !== userId) {
      throw new HttpException({ message: 'この出品のキャンセル権限がありません' }, HttpStatus.FORBIDDEN);
    }

    // ACTIVE 状態のみキャンセル可能
    if (listing.status !== 'ACTIVE') {
      throw new HttpException({ message: 'アクティブな出品のみキャンセルできます' }, HttpStatus.BAD_REQUEST);
    }

    // リスティングのステータスを CANCELLED に更新する
    const updated = await this.prisma.usageListing.update({
      where: { id: listingId },
      data: { status: 'CANCELLED' },
    });

    // 利用権のステータスを MINTED に戻す
    await this.prisma.usageRight.update({
      where: { id: listing.usageRightId },
      data: { status: 'MINTED' },
    });

    return updated;
  }

  // -----------------------------------------------------------------------
  // 出品を購入する（トランザクション処理）
  // -----------------------------------------------------------------------
  async buyListing(listingId: string, buyerUserId: string) {
    // リスティングと利用権を取得する
    const listing = await this.prisma.usageListing.findUnique({
      where: { id: listingId },
      include: { usageRight: true },
    });
    if (!listing) {
      throw new HttpException({ message: 'リスティングが見つかりません' }, HttpStatus.NOT_FOUND);
    }

    // ACTIVE 状態のみ購入可能
    if (listing.status !== 'ACTIVE') {
      throw new HttpException({ message: 'アクティブな出品のみ購入できます' }, HttpStatus.BAD_REQUEST);
    }

    // 自分の出品は購入できない
    if (listing.sellerUserId === buyerUserId) {
      throw new HttpException({ message: '自分のリスティングは購入できません' }, HttpStatus.BAD_REQUEST);
    }

    // トランザクション内でリスティングと利用権を更新する
    const updatedListing = await this.prisma.$transaction(async (tx) => {
      // リスティングを SOLD に更新する
      const sold = await tx.usageListing.update({
        where: { id: listingId },
        data: {
          status: 'SOLD',
          buyerUserId,
          soldAt: new Date(),
        },
      });

      // 利用権の所有者と転送回数を更新する
      await tx.usageRight.update({
        where: { id: listing.usageRightId },
        data: {
          ownerUserId: buyerUserId,
          status: 'MINTED',
          transferCount: { increment: 1 },
        },
      });

      return sold;
    });

    return updatedListing;
  }

  // -----------------------------------------------------------------------
  // アクティブな出品一覧を取得する
  // -----------------------------------------------------------------------
  async listActiveListings(params?: {
    venueId?: string;
    minPriceJpyc?: string;
    maxPriceJpyc?: string;
  }) {
    // 価格フィルタ用の条件を構築する
    const priceFilter: Record<string, string> = {};
    if (params?.minPriceJpyc) priceFilter.gte = params.minPriceJpyc;
    if (params?.maxPriceJpyc) priceFilter.lte = params.maxPriceJpyc;

    return this.prisma.usageListing.findMany({
      where: {
        status: 'ACTIVE',
        ...(Object.keys(priceFilter).length > 0 ? { priceJpyc: priceFilter } : {}),
        // venueId フィルタ: 利用権 → 利用商品 → 店舗ID でフィルタリング
        ...(params?.venueId
          ? {
              usageRight: {
                usageProduct: {
                  venueId: params.venueId,
                },
              },
            }
          : {}),
      },
      include: {
        usageRight: {
          include: {
            usageProduct: {
              include: {
                // 注: UsageProduct は Venue への直接リレーションがないため venueId で表示
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
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
