import { Body, Controller, Get, HttpException, HttpStatus, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { AuthService } from '../services/auth.service';

const VerifyBody = z.object({
  message:   z.string().min(1),
  signature: z.string().min(1),
});

const NonceQuery = z.object({
  address: z.string().regex(/^0x[0-9a-fA-F]{40}$/, 'アドレスが不正です'),
});

@Controller('/v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * GET /v1/auth/nonce?address=0x...
   * SIWE フロー開始：ウォレットアドレス向けのワンタイム nonce を返す
   */
  @Get('/nonce')
  getNonce(@Query() query: unknown) {
    const parsed = NonceQuery.safeParse(query);
    if (!parsed.success) {
      throw new HttpException({ message: 'アドレスが不正です' }, HttpStatus.BAD_REQUEST);
    }
    const nonce = this.auth.generateNonce(parsed.data.address);
    return { nonce };
  }

  /**
   * POST /v1/auth/verify
   * SIWE 署名検証 → JWT 発行
   * Body: { message: string, signature: string }
   */
  @Post('/verify')
  async verify(@Body() body: unknown) {
    const parsed = VerifyBody.safeParse(body);
    if (!parsed.success) {
      throw new HttpException({ message: '入力が不正です' }, HttpStatus.BAD_REQUEST);
    }

    try {
      const token = await this.auth.verifyAndIssueToken(parsed.data.message, parsed.data.signature);
      return { token };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '認証に失敗しました';
      throw new HttpException({ message }, HttpStatus.UNAUTHORIZED);
    }
  }
}
