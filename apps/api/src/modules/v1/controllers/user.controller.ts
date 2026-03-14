import { Controller, Get, HttpException, HttpStatus, Query } from '@nestjs/common';
import { ethers } from 'ethers';
import type { UserBalanceResponse } from '../contracts';
import { CurrentUser, AuthenticatedUser } from '../decorators/current-user.decorator';
import { UserService } from '../services/user.service';

@Controller('/v1/user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * GET /v1/user/balance
   * 認証ユーザーの JPYC 残高を取得する。
   * wallet クエリがあれば、そのウォレット残高を優先して返す（SNS + AA 表示用途）。
   */
  @Get('/balance')
  async balance(
    @CurrentUser() user: AuthenticatedUser,
    @Query('wallet') wallet?: string,
  ): Promise<UserBalanceResponse> {
    const requested = wallet?.trim();
    if (requested) {
      if (!ethers.isAddress(requested) || requested === ethers.ZeroAddress) {
        throw new HttpException({ message: 'wallet クエリの形式が不正です' }, HttpStatus.BAD_REQUEST);
      }
      return this.userService.getBalance(ethers.getAddress(requested));
    }
    return this.userService.getBalance(user.address);
  }
}
