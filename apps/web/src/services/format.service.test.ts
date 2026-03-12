/**
 * FormatService: toBigInt, toSafeNumber, toRevenueStatus, formatPeriodLabel, sleep.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FormatService } from './format.service';

describe('FormatService', () => {
  describe('toBigInt', () => {
    it('returns fallback for null', () => {
      expect(FormatService.toBigInt(null)).toBe(0n);
      expect(FormatService.toBigInt(null, 99n)).toBe(99n);
    });
    it('returns fallback for undefined', () => {
      expect(FormatService.toBigInt(undefined)).toBe(0n);
      expect(FormatService.toBigInt(undefined, 1n)).toBe(1n);
    });
    it('parses valid numeric string', () => {
      expect(FormatService.toBigInt('0')).toBe(0n);
      expect(FormatService.toBigInt('123')).toBe(123n);
      expect(FormatService.toBigInt('999999999999999999')).toBe(999999999999999999n);
    });
    it('returns fallback for invalid string', () => {
      expect(FormatService.toBigInt('abc')).toBe(0n);
      expect(FormatService.toBigInt('12.34')).toBe(0n);
      expect(FormatService.toBigInt('', 5n)).toBe(5n);
    });
  });

  describe('toSafeNumber', () => {
    it('returns number for in-range bigint', () => {
      expect(FormatService.toSafeNumber(0n)).toBe(0);
      expect(FormatService.toSafeNumber(100n)).toBe(100);
      expect(FormatService.toSafeNumber(BigInt(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER);
      expect(FormatService.toSafeNumber(BigInt(Number.MIN_SAFE_INTEGER))).toBe(Number.MIN_SAFE_INTEGER);
    });
    it('clamps to MAX_SAFE_INTEGER when over', () => {
      expect(FormatService.toSafeNumber(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toBe(Number.MAX_SAFE_INTEGER);
      expect(FormatService.toSafeNumber(999999999999999999999n)).toBe(Number.MAX_SAFE_INTEGER);
    });
    it('clamps to MIN_SAFE_INTEGER when under', () => {
      expect(FormatService.toSafeNumber(BigInt(Number.MIN_SAFE_INTEGER) - 1n)).toBe(Number.MIN_SAFE_INTEGER);
    });
  });

  describe('toRevenueStatus', () => {
    it('returns ACTIVE for "ACTIVE"', () => {
      expect(FormatService.toRevenueStatus('ACTIVE')).toBe('ACTIVE');
    });
    it('returns EXPIRED for any other string', () => {
      expect(FormatService.toRevenueStatus('EXPIRED')).toBe('EXPIRED');
      expect(FormatService.toRevenueStatus('')).toBe('EXPIRED');
      expect(FormatService.toRevenueStatus('PENDING')).toBe('EXPIRED');
    });
  });

  describe('formatPeriodLabel', () => {
    it('formats start and end as ja-JP date range', () => {
      const start = '2026-01-01T00:00:00.000Z';
      const end = '2026-01-31T23:59:59.000Z';
      const result = FormatService.formatPeriodLabel(start, end);
      expect(result).toMatch(/\d{4}\/\d{1,2}\/\d{1,2}\s*-\s*\d{4}\/\d{1,2}\/\d{1,2}/);
    });
    it('returns two locale date strings separated by " - "', () => {
      const result = FormatService.formatPeriodLabel('2026-03-01T00:00:00Z', '2026-03-15T00:00:00Z');
      expect(result).toContain(' - ');
      const [s, e] = result.split(' - ');
      expect(s.length).toBeGreaterThan(0);
      expect(e.length).toBeGreaterThan(0);
    });
  });

  describe('sleep', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });
    it('resolves after given ms', async () => {
      const p = FormatService.sleep(100);
      vi.advanceTimersByTime(100);
      await expect(p).resolves.toBeUndefined();
    });
    it('does not resolve before ms', () => {
      const p = FormatService.sleep(200);
      vi.advanceTimersByTime(50);
      let settled = false;
      p.then(() => { settled = true; });
      expect(settled).toBe(false);
      vi.advanceTimersByTime(200);
      return p.then(() => { expect(settled).toBe(true); });
    });
  });
});
