import { Body, Controller, Delete, Get, Headers, HttpException, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { normalizeIdempotencyKey } from '@nodestay/domain';
import { z } from 'zod';
import { IdempotencyService } from '../services/idempotency.service';
import { ListingService } from '../services/listing.service';
import { CurrentUser, type AuthenticatedUser } from '../decorators/current-user.decorator';
import { Public } from '../decorators/public.decorator';

const TxHash = z.string().regex(/^0x[0-9a-fA-F]{64}$/);

const CreateListingBody = z.object({
  usageRightId: z.string().min(1),
  sellerUserId: z.string().optional(),
  priceJpyc: z.string().min(1),
  expiryAt: z.string().datetime().optional(),
  onchainTxHash: TxHash,
});

const CancelListingBody = z.object({
  userId: z.string().optional(),
  onchainTxHash: TxHash,
});

const BuyListingBody = z.object({
  buyerUserId: z.string().optional(),
  onchainTxHash: TxHash,
});

@Controller('/v1/marketplace')
export class MarketplaceController {
  constructor(
    private readonly listing: ListingService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Public()
  @Get('/listings')
  async listListings(
    @Query('venueId') venueId?: string,
    @Query('minPrice') minPrice?: string,
    @Query('maxPrice') maxPrice?: string,
  ) {
    return this.listing.listActiveListings({
      venueId,
      minPriceJpyc: minPrice,
      maxPriceJpyc: maxPrice,
    });
  }

  @Public()
  @Get('/listings/:id')
  async getListing(@Param('id') id: string) {
    const result = await this.listing.getListingById(id);
    if (!result) {
      throw new HttpException({ message: 'リスティングが見つかりません' }, HttpStatus.NOT_FOUND);
    }
    return result;
  }

  @Post('/listings')
  async createListing(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey: string | undefined,
  ) {
    const parsed = CreateListingBody.safeParse(body);
    if (!parsed.success) {
      throw new HttpException({ message: '入力が不正です' }, HttpStatus.BAD_REQUEST);
    }
    if (!rawKey) {
      throw new HttpException({ message: 'Idempotency-Keyが必要です' }, HttpStatus.BAD_REQUEST);
    }

    let key: ReturnType<typeof normalizeIdempotencyKey>;
    try {
      key = normalizeIdempotencyKey(rawKey);
    } catch {
      throw new HttpException({ message: 'Idempotency-Keyが不正です' }, HttpStatus.BAD_REQUEST);
    }

    const requestHash = this.idempotency.hashRequest({
      operation: 'create-listing',
      actor: user.address,
      body: parsed.data,
    });
    const existing = await this.idempotency.get(key);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new HttpException({ message: '同じキーで異なるリクエストはできません' }, HttpStatus.CONFLICT);
      }
      return existing.response;
    }

    const result = await this.listing.createListing({
      usageRightId: parsed.data.usageRightId,
      sellerUserId: user.address,
      priceJpyc: parsed.data.priceJpyc,
      expiryAt: parsed.data.expiryAt ? new Date(parsed.data.expiryAt) : undefined,
      onchainTxHash: parsed.data.onchainTxHash,
    });
    await this.idempotency.save(key, requestHash, result);
    return result;
  }

  @Delete('/listings/:id')
  async cancelListing(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey: string | undefined,
  ) {
    const parsed = CancelListingBody.safeParse(body ?? {});
    if (!parsed.success) {
      throw new HttpException({ message: '入力が不正です' }, HttpStatus.BAD_REQUEST);
    }
    if (!rawKey) {
      throw new HttpException({ message: 'Idempotency-Keyが必要です' }, HttpStatus.BAD_REQUEST);
    }

    let key: ReturnType<typeof normalizeIdempotencyKey>;
    try {
      key = normalizeIdempotencyKey(rawKey);
    } catch {
      throw new HttpException({ message: 'Idempotency-Keyが不正です' }, HttpStatus.BAD_REQUEST);
    }

    const requestHash = this.idempotency.hashRequest({
      operation: 'cancel-listing',
      listingId: id,
      actor: user.address,
      body: parsed.data,
    });
    const existing = await this.idempotency.get(key);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new HttpException({ message: '同じキーで異なるリクエストはできません' }, HttpStatus.CONFLICT);
      }
      return existing.response;
    }

    const result = await this.listing.cancelListing(id, user.address, {
      onchainTxHash: parsed.data.onchainTxHash,
    });
    await this.idempotency.save(key, requestHash, result);
    return result;
  }

  @Post('/listings/:id/buy')
  async buyListing(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey: string | undefined,
  ) {
    const parsed = BuyListingBody.safeParse(body ?? {});
    if (!parsed.success) {
      throw new HttpException({ message: '入力が不正です' }, HttpStatus.BAD_REQUEST);
    }
    if (!rawKey) {
      throw new HttpException({ message: 'Idempotency-Keyが必要です' }, HttpStatus.BAD_REQUEST);
    }

    let key: ReturnType<typeof normalizeIdempotencyKey>;
    try {
      key = normalizeIdempotencyKey(rawKey);
    } catch {
      throw new HttpException({ message: 'Idempotency-Keyが不正です' }, HttpStatus.BAD_REQUEST);
    }

    const requestHash = this.idempotency.hashRequest({
      operation: 'buy-listing',
      listingId: id,
      actor: user.address,
      body: parsed.data,
    });
    const existing = await this.idempotency.get(key);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new HttpException({ message: '同じキーで異なるリクエストはできません' }, HttpStatus.CONFLICT);
      }
      return existing.response;
    }

    const result = await this.listing.buyListing(id, user.address, {
      onchainTxHash: parsed.data.onchainTxHash,
    });
    await this.idempotency.save(key, requestHash, result);
    return result;
  }
}
