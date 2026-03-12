/**
 * フォーマットサービス
 * 純粋なユーティリティ関数。Store や API への書き込みは行わない。
 * 呼び出し例：FormatService.toBigInt(...)、FormatService.sleep(...)
 */

import type { RevenueRightStatus } from '../models/revenue.model';

class FormatServiceClass {
  /**
   * 文字列を bigint に変換する。無効な場合は fallback を返す。
   */
  toBigInt(v: string | null | undefined, fallback = 0n): bigint {
    if (!v) return fallback;
    try {
      return BigInt(v);
    } catch {
      return fallback;
    }
  }

  /**
   * bigint を安全な number に変換する。範囲外の場合は上限/下限を返す。
   */
  toSafeNumber(v: bigint): number {
    if (v > BigInt(Number.MAX_SAFE_INTEGER)) return Number.MAX_SAFE_INTEGER;
    if (v < BigInt(Number.MIN_SAFE_INTEGER)) return Number.MIN_SAFE_INTEGER;
    return Number(v);
  }

  /**
   * 文字列を RevenueRightStatus に変換する。
   */
  toRevenueStatus(v: string): RevenueRightStatus {
    return v === 'ACTIVE' ? 'ACTIVE' : 'EXPIRED';
  }

  /**
   * 期間ラベルをフォーマットする（日本語形式）。
   */
  formatPeriodLabel(startAt: string, endAt: string): string {
    const start = new Date(startAt);
    const end = new Date(endAt);
    const s = start.toLocaleDateString('ja-JP');
    const e = end.toLocaleDateString('ja-JP');
    return `${s} - ${e}`;
  }

  /**
   * 指定ミリ秒待機する。
   */
  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const FormatService = new FormatServiceClass();
