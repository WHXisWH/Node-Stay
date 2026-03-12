import { Body, Controller, HttpException, HttpStatus, Post } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../../prisma/prisma.service';
import { Public } from '../decorators/public.decorator';

const IdentityVerifyBody = z.object({
  userId: z.string().min(1),
  venueId: z.string().min(1),
});

@Controller('/v1/identity')
export class IdentityController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Post('/verify')
  async verify(@Body() body: unknown) {
    const parsed = IdentityVerifyBody.safeParse(body);
    if (!parsed.success) {
      throw new HttpException({ message: '入力が不正です' }, HttpStatus.BAD_REQUEST);
    }

    // 本番では KYC プロバイダー連携、MVP ではレコードを作成して返す
    // actorId は FK 制約のため null に設定（ユーザー ID はペイロードに格納）
    const log = await this.prisma.auditLog.create({
      data: {
        actorType: 'USER',
        actorId: null,
        action: 'IDENTITY_VERIFY',
        targetType: 'USER',
        targetId: parsed.data.userId,
        payload: { venueId: parsed.data.venueId },
      },
    });

    return { identityVerificationId: log.id, status: 'VERIFIED' };
  }
}
