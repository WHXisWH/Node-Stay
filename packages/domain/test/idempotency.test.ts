import { describe, expect, it } from 'vitest';
import { normalizeIdempotencyKey } from '../src/idempotency';

describe('normalizeIdempotencyKey', () => {
  it('accepts valid key', () => {
    expect(normalizeIdempotencyKey('abcDEF12-._')).toBe('abcDEF12-._');
  });

  it('rejects invalid key', () => {
    expect(() => normalizeIdempotencyKey('短い')).toThrow();
  });
});
