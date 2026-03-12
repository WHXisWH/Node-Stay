import { SetMetadata } from '@nestjs/common';

/**
 * 公開APIエンドポイントを示すデコレーター
 * このデコレーターが付与されたエンドポイントはJWT認証をスキップする
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
