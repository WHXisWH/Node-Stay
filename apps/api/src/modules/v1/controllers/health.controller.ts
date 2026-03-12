import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '../contracts';
import { Public } from '../decorators/public.decorator';

@Controller('/v1')
export class HealthController {
  @Public()
  @Get('/health')
  health(): HealthResponse {
    return { ok: true };
  }
}

