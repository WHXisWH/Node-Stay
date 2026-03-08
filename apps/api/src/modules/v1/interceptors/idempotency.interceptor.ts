import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { normalizeIdempotencyKey } from '@nodestay/domain';
import { from, of } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { IdempotencyService } from '../services/idempotency.service';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly idempotency: IdempotencyService) {}

  async intercept(context: ExecutionContext, next: CallHandler) {
    const req = context.switchToHttp().getRequest<{
      method?: string;
      originalUrl?: string;
      headers?: Record<string, string | string[] | undefined>;
      body?: unknown;
      query?: unknown;
      params?: unknown;
    }>();

    const method = (req.method ?? '').toUpperCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return next.handle();

    const path = (req.originalUrl ?? '').split('?')[0];
    // 既に個別実装済みのエンドポイントはスキップする
    if (
      path === '/v1/usage-rights/purchase' ||
      path === '/v1/sessions/checkout' ||
      /^\/v1\/usage-rights\/[^/]+\/transfer$/.test(path)
    ) {
      return next.handle();
    }

    const rawKey = req.headers?.['idempotency-key'];
    const keyValue = Array.isArray(rawKey) ? rawKey[0] : rawKey;
    if (!keyValue) return next.handle();

    let key: ReturnType<typeof normalizeIdempotencyKey>;
    try {
      key = normalizeIdempotencyKey(keyValue);
    } catch {
      throw new BadRequestException({ message: 'Idempotency-Key が不正です' });
    }

    const requestHash = this.idempotency.hashRequest({
      method,
      path,
      body: req.body ?? null,
      query: req.query ?? null,
      params: req.params ?? null,
    });

    const existing = await this.idempotency.get(key);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new ConflictException({ message: '同一 Idempotency-Key で異なるリクエストです' });
      }
      return of(existing.response);
    }

    return next.handle().pipe(
      mergeMap((response) =>
        from(this.idempotency.save(key, requestHash, response)).pipe(
          mergeMap(() => of(response)),
        ),
      ),
    );
  }
}

