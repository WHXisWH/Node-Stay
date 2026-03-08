import { Injectable } from '@nestjs/common';
import crypto from 'node:crypto';
import type { IdempotencyKey } from '@nodestay/domain';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class IdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  hashRequest(input: unknown): string {
    const json = JSON.stringify(input);
    return crypto.createHash('sha256').update(json).digest('hex');
  }

  async get(key: IdempotencyKey) {
    const record = await this.prisma.idempotencyKey.findUnique({
      where: { key },
    });
    if (!record) return undefined;
    return {
      requestHash: record.requestHash,
      response: record.response as any,
    };
  }

  async save(key: IdempotencyKey, requestHash: string, response: unknown) {
    await this.prisma.idempotencyKey.upsert({
      where: { key },
      create: { key, requestHash, response: response as any },
      update: { requestHash, response: response as any },
    });
  }
}
