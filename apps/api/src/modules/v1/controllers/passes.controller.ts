import { Body, Controller, Get, Headers, HttpException, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { normalizeIdempotencyKey } from '@nodestay/domain';
import { z } from 'zod';
import { IdempotencyService } from '../services/idempotency.service';
import { UsageRightService } from '../services/usage-right.service';
import { FeatureFlagsService } from '../services/featureFlags.service';

const PurchaseBody = z.object({
  productId:   z.string().min(1),
  ownerUserId: z.string().optional(),
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

  // -----------------------------------------------------------------------
  // POST /v1/usage-rights/purchase — 購入
  // -----------------------------------------------------------------------

  @Post('/purchase')
  async purchase(
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
      ownerUserId: parsed.data.ownerUserId ?? null,
      productId:   parsed.data.productId,
    });
    if (!right) throw new HttpException({ message: '商品が見つかりません' }, HttpStatus.NOT_FOUND);

    const response = { usageRightId: right.id };
    await this.idempotency.save(key, requestHash, response);
    return response;
  }

  // -----------------------------------------------------------------------
  // GET /v1/usage-rights?ownerUserId=xxx — マイ利用権一覧
  // -----------------------------------------------------------------------

  @Get()
  async list(@Query('ownerUserId') ownerUserId?: string) {
    if (!ownerUserId) throw new HttpException({ message: 'ownerUserId クエリパラメータが必要です' }, HttpStatus.BAD_REQUEST);
    return this.usageRight.listByUser(ownerUserId);
  }

  // -----------------------------------------------------------------------
  // GET /v1/usage-rights/:id — 詳細
  // -----------------------------------------------------------------------

  @Get('/:id')
  async get(@Param('id') id: string) {
    const right = await this.usageRight.getRight(id);
    if (!right) throw new HttpException({ message: '利用権が見つかりません' }, HttpStatus.NOT_FOUND);
    return right;
  }

  // -----------------------------------------------------------------------
  // POST /v1/usage-rights/:id/cancel — キャンセル
  // -----------------------------------------------------------------------

  @Post('/:id/cancel')
  async cancel(@Param('id') id: string) {
    const result = await this.usageRight.cancel(id);
    if (!result) throw new HttpException({ message: '利用権が見つからないか、キャンセルできません' }, HttpStatus.UNPROCESSABLE_ENTITY);
    return { usageRightId: result.id, status: result.status };
  }

  // -----------------------------------------------------------------------
  // POST /v1/usage-rights/:usageRightId/transfer — 譲渡
  // -----------------------------------------------------------------------

  @Post('/:usageRightId/transfer')
  async transfer(
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

    // 転送前のバリデーション（サーバーサイドで転送ルールを強制）
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
