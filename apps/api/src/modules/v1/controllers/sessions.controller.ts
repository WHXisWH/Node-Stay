import { Body, Controller, Get, Headers, HttpException, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { normalizeIdempotencyKey } from '@nodestay/domain';
import { z } from 'zod';
import { IdempotencyService } from '../services/idempotency.service';
import { SessionService } from '../services/session.service';

const CheckInBody = z.object({
  usageRightId: z.string().min(1),
  venueId: z.string().min(1),
  machineId: z.string().optional(),
  checkinMethod: z.string().optional(),
});

const CheckoutBody = z.object({
  sessionId: z.string().min(1),
});

@Controller('/v1/sessions')
export class SessionsController {
  constructor(
    private readonly sessions: SessionService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Get('/:sessionId')
  async getSession(@Param('sessionId') sessionId: string) {
    const session = await this.sessions.getSessionById(sessionId);
    if (!session) throw new HttpException({ message: 'セッションが見つかりません' }, HttpStatus.NOT_FOUND);
    return {
      sessionId: session.id,
      usageRightId: session.usageRightId,
      planName: session.usageRight?.usageProduct?.productName ?? '',
      venueName: session.venue?.name ?? '',
      venueId: session.venueId,
      machineId: session.machineId,
      checkedInAt: session.checkedInAt?.toISOString() ?? '',
      checkedOutAt: session.checkedOutAt?.toISOString() ?? null,
      status: session.status,
      settlementTxHash: session.settlementTxHash ?? null,
    };
  }

  @Get()
  async listSessions(
    @Query('userId') userId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    const sessions = await this.sessions.listSessions({
      userId,
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    return sessions.map((session) => ({
      sessionId: session.id,
      usageRightId: session.usageRightId,
      planName: session.usageRight?.usageProduct?.productName ?? '',
      venueName: session.venue?.name ?? '',
      venueId: session.venueId,
      machineId: session.machineId,
      checkedInAt: session.checkedInAt?.toISOString() ?? '',
      checkedOutAt: session.checkedOutAt?.toISOString() ?? null,
      status: session.status,
      settlementTxHash: session.settlementTxHash ?? null,
    }));
  }

  @Post('/checkin')
  async checkin(@Body() body: unknown) {
    const parsed = CheckInBody.safeParse(body);
    if (!parsed.success) throw new HttpException({ message: '入力が不正です' }, HttpStatus.BAD_REQUEST);

    const session = await this.sessions.startSession({
      usageRightId: parsed.data.usageRightId,
      venueId: parsed.data.venueId,
      machineId: parsed.data.machineId,
      checkinMethod: parsed.data.checkinMethod,
    });

    return { sessionId: session.id };
  }

  @Post('/checkout')
  async checkout(
    @Body() body: unknown,
    @Headers('idempotency-key') rawKey: string | undefined,
  ) {
    const parsed = CheckoutBody.safeParse(body);
    if (!parsed.success) throw new HttpException({ message: '入力が不正です' }, HttpStatus.BAD_REQUEST);
    if (!rawKey) throw new HttpException({ message: 'Idempotency-Key が必要です' }, HttpStatus.BAD_REQUEST);

    let key: ReturnType<typeof normalizeIdempotencyKey>;
    try {
      key = normalizeIdempotencyKey(rawKey);
    } catch {
      throw new HttpException({ message: 'Idempotency-Key が不正です' }, HttpStatus.BAD_REQUEST);
    }

    const requestHash = this.idempotency.hashRequest(parsed.data);
    const existing = await this.idempotency.get(key);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new HttpException({ message: '同一キーで内容が異なります' }, HttpStatus.CONFLICT);
      }
      return existing.response;
    }

    const ended = await this.sessions.endSession(parsed.data.sessionId);
    if (!ended) throw new HttpException({ message: 'セッションが見つかりません' }, HttpStatus.NOT_FOUND);

    const response = {
      usedMinutes: ended.usedMinutes ?? 0,
      charges: { baseMinor: 0, overtimeMinor: 0, amenitiesMinor: 0, damageMinor: 0 },
    };
    await this.idempotency.save(key, requestHash, response);
    return response;
  }
}
