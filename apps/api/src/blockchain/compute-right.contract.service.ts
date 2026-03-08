import { Injectable, Logger } from '@nestjs/common';
import { BlockchainService } from './blockchain.service';
import { NodeStayComputeRight__factory } from '../../../../packages/contracts/typechain-types';

/**
 * ComputeRightContractService
 * NodeStayComputeRight ERC-721 コントラクトの呼び出しをラップ。
 */
@Injectable()
export class ComputeRightContractService {
  private readonly logger = new Logger(ComputeRightContractService.name);

  constructor(private readonly blockchain: BlockchainService) {}

  private get contract() {
    const address = process.env.COMPUTE_RIGHT_ADDRESS;
    if (!address || !this.blockchain.isEnabled) return null;
    return NodeStayComputeRight__factory.connect(address, this.blockchain.signer);
  }

  /**
   * 算力権 NFT を mint する（購入時）
   * @returns { tokenId, txHash } or null
   */
  async mintComputeRight(input: {
    to: string;               // 購入者ウォレットアドレス
    nodeId: string;           // bytes32 (keccak256(offchainMachineId))
    durationSeconds: bigint;  // 購入した利用時間（秒）
    priceJpyc: bigint;        // 支払い JPYC 量（18 decimals）
  }): Promise<{ tokenId: bigint; txHash: string } | null> {
    const c = this.contract;
    if (!c) {
      this.logger.debug('ComputeRight: コントラクト未設定。mint をスキップ。');
      return null;
    }

    try {
      const tx = await c.mintComputeRight(
        input.to,
        input.nodeId as `0x${string}`,
        input.durationSeconds,
        input.priceJpyc,
      );
      const receipt = await tx.wait();

      // ComputeRightMinted イベントから tokenId を取得
      const event = receipt?.logs
        .map((l) => { try { return c.interface.parseLog(l as any); } catch { return null; } })
        .find((e) => e?.name === 'ComputeRightMinted');

      if (!event) throw new Error('ComputeRightMinted イベントが見つかりません');

      return {
        tokenId: event.args.tokenId as bigint,
        txHash:  receipt!.hash,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`mintComputeRight 失敗: ${msg}`);
      return null;
    }
  }

  /**
   * ジョブを開始する（ISSUED/RESERVED → RUNNING）
   * @returns txHash or null
   */
  async startJob(tokenId: bigint): Promise<string | null> {
    const c = this.contract;
    if (!c) {
      this.logger.debug('ComputeRight: コントラクト未設定。startJob をスキップ。');
      return null;
    }

    try {
      const tx = await c.startJob(tokenId);
      const receipt = await tx.wait();
      return receipt!.hash;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`startJob 失敗 (tokenId=${tokenId}): ${msg}`);
      return null;
    }
  }

  /**
   * ジョブを正常完了する（RUNNING → COMPLETED）
   * プラットフォーム手数料を自動精算する
   * @returns txHash or null
   */
  async completeJob(tokenId: bigint): Promise<string | null> {
    const c = this.contract;
    if (!c) {
      this.logger.debug('ComputeRight: コントラクト未設定。completeJob をスキップ。');
      return null;
    }

    try {
      const tx = await c.completeJob(tokenId);
      const receipt = await tx.wait();
      return receipt!.hash;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`completeJob 失敗 (tokenId=${tokenId}): ${msg}`);
      return null;
    }
  }

  /**
   * ジョブを中断する（Pro-Rata 精算）
   * 使用時間に応じて按比例で精算し、未使用分を返金する
   * @returns txHash or null
   */
  async interruptJob(tokenId: bigint, buyer: string): Promise<string | null> {
    const c = this.contract;
    if (!c) {
      this.logger.debug('ComputeRight: コントラクト未設定。interruptJob をスキップ。');
      return null;
    }

    try {
      const tx = await c.interruptJob(tokenId, buyer);
      const receipt = await tx.wait();
      return receipt!.hash;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`interruptJob 失敗 (tokenId=${tokenId}): ${msg}`);
      return null;
    }
  }

  /**
   * ジョブを失敗としてマークし全額返金する
   * @returns txHash or null
   */
  async failJob(tokenId: bigint, buyer: string): Promise<string | null> {
    const c = this.contract;
    if (!c) {
      this.logger.debug('ComputeRight: コントラクト未設定。failJob をスキップ。');
      return null;
    }

    try {
      const tx = await c.failJob(tokenId, buyer);
      const receipt = await tx.wait();
      return receipt!.hash;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`failJob 失敗 (tokenId=${tokenId}): ${msg}`);
      return null;
    }
  }
}
