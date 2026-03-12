import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * 認証済みユーザー情報の型定義
 */
export interface AuthenticatedUser {
  address: string;
}

/**
 * リクエストから認証済みユーザー情報を取得するデコレーター
 * JwtAuthGuardによって設定されたユーザー情報を抽出する
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.user as AuthenticatedUser;
  },
);
