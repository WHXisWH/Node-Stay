import { Body, Controller, Get, Headers, HttpException, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { normalizeIdempotencyKey } from '@nodestay/domain';
import { z } from 'zod';
import { IdempotencyService } from '../services/idempotency.service';
import { UsageRightService } from '../services/usage-right.service';
import { FeatureFlagsService } from '../services/featureFlags.service';
import { CurrentUser, type AuthenticatedUser } from '../decorators/current-user.decorator';

const PurchaseBody = z.object({
  productId:   z.string().min(1),
  buyerWallet: z.string().optional(),
});

const TransferBody = z.object({
  newOwnerUserId: z.string().min(1),
});

@Controller('/v1/usage-rights')
export class PassesController {
  constructor(
    private readonly idempotency: IdempotencyService,
    private readonly usageRight: UsageRightService,
    private readonly flags: FeatureFlagsService,
  ) {}

  @Post('/purchase')
  async purchase(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey: string | undefined,
  ) {
    const parsed = PurchaseBody.safeParse(body);
    if (!parsed.success) throw new HttpException({ message: '入力が不正です' }, HttpStatus.BAD_REQUEST);
    if (!rawKey) throw new HttpException({ message: 'Idempotency-Key が必要です' }, HttpStatus.BAD_REQUEST);

    let key: ReturnType<typeof normalizeIdempotencyKey>;
    try { key = normalizeIdempotencyKey(rawKey); }
    catch { throw new HttpException({ message: 'Idempotency-Key が不正です' }, HttpStatus.BAD_REQUEST); }

    const requestHash = this.idempotency.hashRequest(parsed.data);
    const existing = await this.idempotency.get(key);
    if (existing) {
      if (existing.requestHash !== requestHash) throw new HttpException({ message: '同一キーで内容が異なります' }, HttpStatus.CONFLICT);
      return existing.response;
    }

    const right = await this.usageRight.purchase({
      ownerUserId: user.address,
      productId:   parsed.data.productId,
      buyerWallet: parsed.data.buyerWallet ?? user.address,
    });
    if (!right) throw new HttpException({ message: '商品が見つかりません' }, HttpStatus.NOT_FOUND);

    const response = { usageRightId: right.id };
    await this.idempotency.save(key, requestHash, response);
    return response;
  }

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser) {
    return this.usageRight.listByUser({ walletAddress: user.address });
  }

  @Get('/:id')
  async get(@Param('id') id: string) {
    const right = await this.usageRight.getRight(id);
    if (!right) throw new HttpException({ message: '利用権が見つかりません' }, HttpStatus.NOT_FOUND);
    return right;
  }

  @Post('/:id/cancel')
  async cancel(@CurrentUser() _user: AuthenticatedUser, @Param('id') id: string) {
    const result = await this.usageRight.cancel(id);
    if (!result) throw new HttpException({ message: '利用権が見つからないか、キャンセルできません' }, HttpStatus.UNPROCESSABLE_ENTITY);
    return { usageRightId: result.id, status: result.status };
  }

  @Post('/:usageRightId/transfer')
  async transfer(
    @CurrentUser() _user: AuthenticatedUser,
    @Param('usageRightId') usageRightId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey: string | undefined,
  ) {
    if (!this.flags.transferMarketEnabled()) throw new HttpException({ message: '譲渡機能は無効です' }, HttpStatus.NOT_IMPLEMENTED);
    if (!rawKey) throw new HttpException({ message: 'Idempotency-Key が必要です' }, HttpStatus.BAD_REQUEST);

    const parsed = TransferBody.safeParse(body);
    if (!parsed.success) throw new HttpException({ message: '入力が不正です（newOwnerUserId 必須）' }, HttpStatus.BAD_REQUEST);

    let key: ReturnType<typeof normalizeIdempotencyKey>;
    try { key = normalizeIdempotencyKey(rawKey); }
    catch { throw new HttpException({ message: 'Idempotency-Key が不正です' }, HttpStatus.BAD_REQUEST); }

    const requestHash = this.idempotency.hashRequest({ usageRightId, ...parsed.data });
    const existing = await this.idempotency.get(key);
    if (existing) {
      if (existing.requestHash !== requestHash) throw new HttpException({ message: '同一キーで内容が異なります' }, HttpStatus.CONFLICT);
      return existing.response;
    }

    const right = await this.usageRight.findById(usageRightId);
    if (!right) throw new HttpException({ message: '利用権が見つかりません' }, HttpStatus.NOT_FOUND);
    if (!right.transferable) throw new HttpException({ message: 'この利用権は譲渡不可です' }, HttpStatus.FORBIDDEN);
    if (right.transferCount >= right.maxTransferCount) {
      throw new HttpException({ message: '最大譲渡回数に達しています' }, HttpStatus.FORBIDDEN);
    }
    if (right.transferCutoffAt && new Date() > new Date(right.transferCutoffAt)) {
      throw new HttpException({ message: '譲渡期限が過ぎています' }, HttpStatus.FORBIDDEN);
    }

    const result = await this.usageRight.transfer(usageRightId, parsed.data.newOwnerUserId);
    if (!result) throw new HttpException({ message: '利用権が見つからないか、譲渡できません' }, HttpStatus.NOT_FOUND);

    const response = { usageRightId: result.id, status: result.status };
    await this.idempotency.save(key, requestHash, response);
    return response;
  }
}
