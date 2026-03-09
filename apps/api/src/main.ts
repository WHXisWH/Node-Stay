import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './modules/app.module';

const DEFAULT_CORS_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000'];

function parseCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS;
  if (!raw || !raw.trim()) return DEFAULT_CORS_ORIGINS;

  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  // credentials=true のため wildcard は無効。設定されていても除外する。
  const filtered = origins.filter((origin) => origin !== '*');
  return filtered.length > 0 ? filtered : DEFAULT_CORS_ORIGINS;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'log'] });
  const corsOrigins = parseCorsOrigins();
  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    credentials: true,
  });
  app.setGlobalPrefix('');
  await app.listen(process.env.PORT ? Number(process.env.PORT) : 3001);
}

void bootstrap();
