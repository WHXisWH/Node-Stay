import { describe, expect, it } from 'vitest';
import { addMoney } from '../src/money';

describe('addMoney', () => {
  it('adds same currency', () => {
    expect(addMoney({ currency: 'JPYC', amountMinor: 10 }, { currency: 'JPYC', amountMinor: 5 })).toEqual({
      currency: 'JPYC',
      amountMinor: 15,
    });
  });

  it('throws on mismatch currency', () => {
    expect(() => addMoney({ currency: 'JPYC', amountMinor: 10 }, { currency: 'USD' as any, amountMinor: 1 })).toThrow(
      '通貨が一致しません',
    );
  });
});
