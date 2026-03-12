import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { ListingService } from '../services/listing.service';
import { Public } from '../decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../decorators/current-user.decorator';
import { UserService } from '../services/user.service';

// -----------------------------------------------------------------------
// 出品作成リクエストのバリデーションスキーマ
// -----------------------------------------------------------------------
const CreateListingBody = z.object({
  usageRightId: z.string().min(1),
  sellerUserId: z.string().min(1),
  priceJpyc:    z.string().min(1),
  expiryAt:     z.string().datetime().optional(),
});

// -----------------------------------------------------------------------
// 出品キャンセルリクエストのバリデーションスキーマ
// -----------------------------------------------------------------------
const CancelListingBody = z.object({
  userId: z.string().min(1),
});

// -----------------------------------------------------------------------
// 購入リクエストのバリデーションスキーマ
// -----------------------------------------------------------------------
const BuyListingBody = z.object({
  buyerUserId: z.string().min(1),
});

// -----------------------------------------------------------------------
// マーケットプレイスコントローラー
// 利用権の出品・一覧・購入・キャンセルを処理する
// -----------------------------------------------------------------------
@Controller('/v1/marketplace')
export class MarketplaceController {
  constructor(
    private readonly listing: ListingService,
    private readonly userService: UserService,
  ) {}

  // -----------------------------------------------------------------------
  // GET /v1/marketplace/listings — アクティブな出品一覧を取得する
  // クエリパラメータ: venueId?, minPrice?, maxPrice?
  // -----------------------------------------------------------------------
  @Public()
  @Get('/listings')
  async listListings(
    @Query('venueId')   venueId?: string,
    @Query('minPrice')  minPrice?: string,
    @Query('maxPrice')  maxPrice?: string,
  ) {
    return this.listing.listActiveListings({
      venueId,
      minPriceJpyc: minPrice,
      maxPriceJpyc: maxPrice,
    });
  }

  // -----------------------------------------------------------------------
  // GET /v1/marketplace/listings/:id — 出品詳細を取得する
  // -----------------------------------------------------------------------
  @Public()
  @Get('/listings/:id')
  async getListing(@Param('id') id: string) {
    const result = await this.listing.getListingById(id);
    if (!result) throw new HttpException({ message: 'リスティングが見つかりません' }, HttpStatus.NOT_FOUND);
    return result;
  }

  // -----------------------------------------------------------------------
  // POST /v1/marketplace/listings — 利用権を出品する（認証必須）
  // -----------------------------------------------------------------------
  @Post('/listings')
  async createListing(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = CreateListingBody.safeParse(body);
    if (!parsed.success) {
      throw new HttpException({ message: '入力が不正です' }, HttpStatus.BAD_REQUEST);
    }

    // ウォレットアドレスから userId を解決
    const sellerUserId = parsed.data.sellerUserId || await this.userService.findOrCreateByWallet(user.address);

    return this.listing.createListing({
      usageRightId: parsed.data.usageRightId,
      sellerUserId,
      priceJpyc:    parsed.data.priceJpyc,
      expiryAt:     parsed.data.expiryAt ? new Date(parsed.data.expiryAt) : undefined,
    });
  }

  // -----------------------------------------------------------------------
  // DELETE /v1/marketplace/listings/:id — 出品をキャンセルする（認証必須）
  // -----------------------------------------------------------------------
  @Delete('/listings/:id')
  async cancelListing(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const parsed = CancelListingBody.safeParse(body);
    // userId が指定されていなければウォレットから解決
    const userId = parsed.success && parsed.data.userId
      ? parsed.data.userId
      : await this.userService.findOrCreateByWallet(user.address);

    return this.listing.cancelListing(id, userId);
  }

  // -----------------------------------------------------------------------
  // POST /v1/marketplace/listings/:id/buy — 出品を購入する（認証必須）
  // -----------------------------------------------------------------------
  @Post('/listings/:id/buy')
  async buyListing(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const parsed = BuyListingBody.safeParse(body);
    // buyerUserId が指定されていなければウォレットから解決
    const buyerUserId = parsed.success && parsed.data.buyerUserId
      ? parsed.data.buyerUserId
      : await this.userService.findOrCreateByWallet(user.address);

    return this.listing.buyListing(id, buyerUserId);
  }
}
