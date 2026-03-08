import { z } from 'zod';

export const CurrencyCodeSchema = z.literal('JPYC');
export type CurrencyCode = z.infer<typeof CurrencyCodeSchema>;

export const MoneySchema = z.object({
  currency: CurrencyCodeSchema,
  amountMinor: z.number().int().nonnegative(),
});
export type Money = z.infer<typeof MoneySchema>;

export function addMoney(a: Money, b: Money): Money {
  if (a.currency !== b.currency) {
    throw new Error('通貨が一致しません');
  }
  return { currency: a.currency, amountMinor: a.amountMinor + b.amountMinor };
}

