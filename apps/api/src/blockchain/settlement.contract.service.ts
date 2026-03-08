import { Injectable, Logger } from '@nestjs/common';
import { BlockchainService } from './blockchain.service';
import { NodeStaySettlement__factory } from '../../../../packages/contracts/typechain-types';

/**
 * SettlementContractService
 * NodeStaySettlement コントラクトの呼び出しをラップ。
 *
 * コントラクト シグネチャ（Settlement.sol より）:
 *   holdDeposit(referenceId, payer, amount)
 *   captureDeposit(referenceId, amount)
 *   releaseDeposit(referenceId, amount)
 *   settleUsage(sessionId, machineId, payer, venueTreasury, grossAmount, platformFeeBps, revenueFeeBps)
 */
@Injectable()
export class SettlementContractService {
  private readonly logger = new Logger(SettlementContractService.name);

  constructor(private readonly blockchain: BlockchainService) {}

  private get contract() {
    const address = process.env.SETTLEMENT_ADDRESS;
    if (!address || !this.blockchain.isEnabled) return null;
    return NodeStaySettlement__factory.connect(address, this.blockchain.signer);
  }

  /**
   * 購入時にデポジットを hold する
   */
  async holdDeposit(input: {
    referenceId: string;  // bytes32
    payer: string;        // 購入者アドレス
    amount: bigint;       // JPYC wei 単位
  }): Promise<string | null> {
    const c = this.contract;
    if (!c) {
      this.logger.debug('Settlement: コントラクト未設定。holdDeposit をスキップ。');
      return null;
    }

    try {
      const tx = await c.holdDeposit(input.referenceId, input.payer, input.amount);
      const receipt = await tx.wait();
      return receipt!.hash;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`holdDeposit 失敗: ${msg}`);
      return null;
    }
  }

  /**
   * チェックアウト時に三方分配で精算する
   */
  async settleUsage(input: {
    sessionId: string;      // bytes32（セッション ID → referenceId）
    machineId: string;      // bytes32
    payer: string;          // 支払者アドレス
    venueTreasury: string;  // 店舗受取アドレス
    grossAmount: bigint;    // JPYC 総額
    platformFeeBps: number;
    revenueFeeBps: number;
  }): Promise<string | null> {
    const c = this.contract;
    if (!c) {
      this.logger.debug('Settlement: コントラクト未設定。settleUsage をスキップ。');
      return null;
    }

    try {
      const tx = await c.settleUsage(
        input.sessionId,
        input.machineId,
        input.payer,
        input.venueTreasury,
        input.grossAmount,
        input.platformFeeBps,
        input.revenueFeeBps,
      );
      const receipt = await tx.wait();
      return receipt!.hash;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`settleUsage 失敗: ${msg}`);
      return null;
    }
  }

  /**
   * キャンセル時にデポジットを返金する
   */
  async releaseDeposit(referenceId: string, amount: bigint): Promise<string | null> {
    const c = this.contract;
    if (!c) return null;

    try {
      const tx = await c.releaseDeposit(referenceId, amount);
      const receipt = await tx.wait();
      return receipt!.hash;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`releaseDeposit 失敗: ${msg}`);
      return null;
    }
  }

  /**
   * デポジット残高を照会する
   */
  async getHeldAmount(referenceId: string): Promise<bigint | null> {
    const c = this.contract;
    if (!c) return null;

    try {
      return await c.heldAmount(referenceId);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`heldAmount 照会失敗: ${msg}`);
      return null;
    }
  }

  /**
   * bytes32 の referenceId を生成する（UUID → bytes32 変換）
   */
  static toReferenceId(uuid: string): string {
    const hex = uuid.replace(/-/g, '').padEnd(64, '0');
    return '0x' + hex;
  }
}
