import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import type { UserBalanceResponse } from '../contracts';
import { BlockchainService } from '../../../blockchain/blockchain.service';
import { PrismaService } from '../../../prisma/prisma.service';

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
] as const;

/** JPYC は 18 decimals。API の balanceMinor は 1 JPYC = 100 の単位（1/100 円相当）。 */
const WEI_PER_JPYC = 10n ** 18n;
const MINOR_PER_JPYC = 100;

/**
 * ユーザー関連のサービス
 * ウォレットアドレスからのユーザー解決、残高取得などを担当
 */
@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly blockchain: BlockchainService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * userId を解決する。userId 直接指定が優先。walletAddress 指定時は users テーブルから解決する。
   */
  async resolveUserId(input: {
    userId?: string;
    walletAddress?: string;
  }): Promise<string | null> {
    if (input.userId) return input.userId;
    if (!input.walletAddress) return null;

    const user = await this.prisma.user.findFirst({
      where: {
        walletAddress: {
          equals: input.walletAddress,
          mode: 'insensitive',
        },
      },
      select: { id: true },
    });
    return user?.id ?? null;
  }

  /**
   * ウォレットアドレスでユーザーを検索し、いなければ作成して user.id を返す。
   * 購入時に owner_user_id を設定する際の FK を満たすために使用する。
   */
  async findOrCreateByWallet(walletAddress: string): Promise<string> {
    const normalized = walletAddress.trim();
    if (!normalized) throw new Error('walletAddress is required');

    const existing = await this.prisma.user.findFirst({
      where: {
        walletAddress: { equals: normalized, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (existing) return existing.id;

    const created = await this.prisma.user.create({
      data: { walletAddress: normalized, status: 'ACTIVE' },
      select: { id: true },
    });
    return created.id;
  }

  /**
   * 指定アドレスの JPYC 残高（wei, 18 decimals）を取得する。
   * プロバイダ未初期化・JPYC_TOKEN_ADDRESS 未設定時は 0n を返す。
   */
  private async getJPYCBalanceWei(address: string): Promise<bigint> {
    if (!this.blockchain.isEnabled) {
      this.logger.debug('JPYC 残高: プロバイダ未設定のため 0 を返します');
      return 0n;
    }

    const tokenAddress = process.env.JPYC_TOKEN_ADDRESS;
    if (!tokenAddress || !tokenAddress.startsWith('0x')) {
      this.logger.debug('JPYC_TOKEN_ADDRESS 未設定のため 0 を返します');
      return 0n;
    }

    try {
      const contract = new ethers.Contract(
        tokenAddress,
        ERC20_ABI,
        this.blockchain.provider,
      );
      const balance = await contract.balanceOf(address);
      return typeof balance === 'bigint' ? balance : BigInt(balance.toString());
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`JPYC balanceOf 失敗 (address=${address}): ${msg}`);
      return 0n;
    }
  }

  /**
   * 指定ウォレットアドレスの JPYC 残高を取得する。
   * 鏈上 balanceOf を取得し、balanceMinor（1 JPYC = 100）に変換して返す。
   * depositHeldMinor は現状 0（Settlement の hold 照会は別途実装可能）。
   */
  async getBalance(address: string): Promise<UserBalanceResponse> {
    const balanceWei = await this.getJPYCBalanceWei(address);
    const balanceMinor = Number(
      (balanceWei * BigInt(MINOR_PER_JPYC)) / WEI_PER_JPYC,
    );
    return {
      currency: 'JPYC',
      balanceMinor: Math.max(0, balanceMinor),
      depositHeldMinor: 0,
    };
  }
}
