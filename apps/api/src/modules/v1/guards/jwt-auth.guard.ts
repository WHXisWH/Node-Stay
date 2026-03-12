import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthService } from '../services/auth.service';

/**
 * JWT認証ガード
 * 全エンドポイントに適用され、@Public()デコレーターがない場合はJWT認証を強制する
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // @Public()デコレーターがある場合は認証をスキップ
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const authorization: string | undefined = request.headers['authorization'];
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice(7)
      : undefined;

    if (!token) {
      throw new HttpException(
        { message: '認証が必要です' },
        HttpStatus.UNAUTHORIZED,
      );
    }

    try {
      const payload = this.auth.verifyToken(token);
      request.user = { address: payload.address };
      return true;
    } catch {
      throw new HttpException(
        { message: 'トークンが無効です' },
        HttpStatus.UNAUTHORIZED,
      );
    }
  }
}
