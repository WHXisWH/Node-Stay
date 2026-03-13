import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '../contracts';
import { Public } from '../decorators/public.decorator';
import { PrismaService } from '../../../prisma/prisma.service';

/**
 * ヘルスチェック API コントローラー
 * システム全体の稼働状態を返す
 */
@Controller('/v1')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('/health')
  async health(): Promise<HealthResponse> {
    const timestamp = new Date().toISOString();

    // API サーバーのレイテンシ（このリクエスト自体の処理時間）
    const apiStart = Date.now();

    // データベース接続チェック
    let dbStatus: 'ok' | 'degraded' | 'error' = 'ok';
    let dbLatency: number | undefined;
    try {
      const dbStart = Date.now();
      // 軽量なクエリでデータベース接続を確認
      await this.prisma.$queryRaw`SELECT 1`;
      dbLatency = Date.now() - dbStart;
      // レイテンシが 500ms を超えたら degraded
      if (dbLatency > 500) {
        dbStatus = 'degraded';
      }
    } catch {
      dbStatus = 'error';
    }

    // ブロックチェーン同期状態（現在は簡易実装）
    // TODO: 実際の Polygon ノードとの同期状態を確認する
    const blockchainStatus = 'ok' as const;

    // API レイテンシ計測
    const apiLatency = Date.now() - apiStart;

    // 全体ステータスの判定
    // データベースまたはブロックチェーンの状態に基づいて決定
    let overallStatus: 'ok' | 'degraded' | 'error' = 'ok';
    if (dbStatus === 'error') {
      overallStatus = 'error';
    } else if (dbStatus === 'degraded') {
      overallStatus = 'degraded';
    }

    return {
      status: overallStatus,
      timestamp,
      services: {
        api: {
          status: 'ok',
          latency: apiLatency,
        },
        database: {
          status: dbStatus,
          latency: dbLatency,
        },
        blockchain: {
          status: blockchainStatus,
          // ブロック高さは後で実装
        },
      },
    };
  }
}
