import { Injectable } from '@nestjs/common';
import crypto from 'node:crypto';
import { MoneySchema } from '@nodestay/domain';

@Injectable()
export class LedgerService {
  createPurchaseTx(input: { productId: string; venueId: string } & { currency: 'JPYC'; amountMinor: number }) {
    MoneySchema.parse({ currency: input.currency, amountMinor: input.amountMinor });
    const seed = `${input.productId}:${input.venueId}:${input.currency}:${input.amountMinor}`;
    const digest = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 16);
    return `ltx_${digest}`;
  }
}
