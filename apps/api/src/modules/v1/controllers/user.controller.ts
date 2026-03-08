import { Controller, Get } from '@nestjs/common';
import type { UserBalanceResponse } from '../contracts';

@Controller('/v1/user')
export class UserController {
  @Get('/balance')
  balance(): UserBalanceResponse {
    // MVP: 実装はウォレット方式（ノンカストディ/カストディ）で大きく変わるため、ここでは形だけ定義
    return { currency: 'JPYC', balanceMinor: 0, depositHeldMinor: 0 };
  }
}

