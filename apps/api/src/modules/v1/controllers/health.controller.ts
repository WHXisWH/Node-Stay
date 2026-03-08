import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '../contracts';

@Controller('/v1')
export class HealthController {
  @Get('/health')
  health(): HealthResponse {
    return { ok: true };
  }
}

