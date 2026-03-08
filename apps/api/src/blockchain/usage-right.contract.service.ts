import { Injectable, Logger } from '@nestjs/common';
import { BlockchainService } from './blockchain.service';
import { NodeStayUsageRight__factory } from '../../../../packages/contracts/typechain-types';

/**
 * UsageRightContractService
 * NodeStayUsageRight ERC-721 コントラクトの呼び出しをラップ。
 */
@Injectable()
export class UsageRightContractService {
  private readonly logger = new Logger(UsageRightContractService.name);

  constructor(private readonly blockchain: BlockchainService) {}

  private get contract() {
    const address = process.env.USAGE_RIGHT_ADDRESS;
    if (!address || !this.blockchain.isEnabled) return null;
    return NodeStayUsageRight__factory.connect(address, this.blockchain.signer);
  }

  /**
   * 使用権 NFT を mint する
   * @returns { tokenId, txHash } or null
   */
  async mintUsageRight(input: {
    to: string;             // 購入者ウォレットアドレス
    machineId: string;      // bytes32
    machinePoolId: string;  // bytes32（未指定時は ZeroHash）
    startAt: bigint;
    endAt: bigint;
    usageType: number;      // UsageType enum
    transferable: boolean;
    transferCutoff: bigint;
    maxTransferCount: number;
    kycLevelRequired: number;
    metadataUri: string;
  }): Promise<{ tokenId: bigint; txHash: string } | null> {
    const c = this.contract;
    if (!c) {
      this.logger.debug('UsageRight: コントラクト未設定。mint をスキップ。');
      return null;
    }

    try {
      const tx = await c.mintUsageRight(
        input.to,
        input.machineId,
        input.machinePoolId,
        input.startAt,
        input.endAt,
        input.usageType,
        input.transferable,
        input.transferCutoff,
        input.maxTransferCount,
        input.kycLevelRequired,
        input.metadataUri,
      );
      const receipt = await tx.wait();

      const event = receipt?.logs
        .map((l) => { try { return c.interface.parseLog(l as any); } catch { return null; } })
        .find((e) => e?.name === 'UsageRightMinted');

      if (!event) throw new Error('UsageRightMinted イベントが見つかりません');

      return {
        tokenId: event.args.usageRightId as bigint,
        txHash:  receipt!.hash,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`mintUsageRight 失敗: ${msg}`);
      return null;
    }
  }

  /**
   * 使用権を消費済みにする（チェックアウト後）
   */
  async consumeUsageRight(tokenId: bigint): Promise<string | null> {
    const c = this.contract;
    if (!c) return null;

    try {
      const tx = await c.consumeUsageRight(tokenId);
      const receipt = await tx.wait();
      return receipt!.hash;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`consumeUsageRight 失敗: ${msg}`);
      return null;
    }
  }

  /**
   * 使用権をキャンセルする
   */
  async cancelUsageRight(tokenId: bigint): Promise<string | null> {
    const c = this.contract;
    if (!c) return null;

    try {
      const tx = await c.cancelUsageRight(tokenId);
      const receipt = await tx.wait();
      return receipt!.hash;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`cancelUsageRight 失敗: ${msg}`);
      return null;
    }
  }

  /**
   * 使用権 NFT を別アドレスへ転送する（ERC-721 safeTransferFrom）
   * @param from 送信元アドレス
   * @param to 送信先アドレス
   * @param tokenId 転送対象トークン ID
   * @returns txHash or null
   */
  async transferUsageRight(from: string, to: string, tokenId: bigint): Promise<string | null> {
    const c = this.contract;
    if (!c) {
      this.logger.debug('UsageRight: コントラクト未設定。transfer をスキップ。');
      return null;
    }

    try {
      const tx = await c['safeTransferFrom(address,address,uint256)'](from, to, tokenId);
      const receipt = await tx.wait();
      return receipt!.hash;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`transferUsageRight 失敗: ${msg}`);
      return null;
    }
  }
}
