import { Injectable } from '@nestjs/common';

@Injectable()
export class FeatureFlagsService {
  computeMarketEnabled(): boolean {
    return process.env.ENABLE_COMPUTE_MARKET === 'true';
  }

  transferMarketEnabled(): boolean {
    return process.env.ENABLE_TRANSFER_MARKET === 'true';
  }
}

