import { Controller, Get } from '@nestjs/common';
import type { UserBalanceResponse } from '../contracts';
import { CurrentUser, AuthenticatedUser } from '../decorators/current-user.decorator';
import { UserService } from '../services/user.service';

@Controller('/v1/user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * GET /v1/user/balance
   * 認証ユーザーの JPYC 残高を取得する
   */
  @Get('/balance')
  async balance(@CurrentUser() user: AuthenticatedUser): Promise<UserBalanceResponse> {
    return this.userService.getBalance(user.address);
  }
}

