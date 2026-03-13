import { Injectable } from '@nestjs/common';

@Injectable()
export class FeatureFlagsService {
  computeMarketEnabled(): boolean {
    return process.env.ENABLE_COMPUTE_MARKET === 'true';
  }

  computeOnchainWriteEnabled(): boolean {
    return process.env.ENABLE_COMPUTE_ONCHAIN_WRITE === 'true';
  }

  transferMarketEnabled(): boolean {
    return process.env.ENABLE_TRANSFER_MARKET === 'true';
  }

  strictOnchainModeEnabled(): boolean {
    return process.env.STRICT_ONCHAIN_MODE !== 'false';
  }
}
