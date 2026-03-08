import { Injectable, Logger } from '@nestjs/common';
import { BlockchainService } from './blockchain.service';
import { NodeStayRevenueRight__factory } from '../../../../packages/contracts/typechain-types';

@Injectable()
export class RevenueRightContractService {
  private readonly logger = new Logger(RevenueRightContractService.name);

  constructor(private readonly blockchain: BlockchainService) {}

  private get contract() {
    const address = process.env.REVENUE_RIGHT_ADDRESS;
    if (!address || !this.blockchain.isEnabled) return null;
    return NodeStayRevenueRight__factory.connect(address, this.blockchain.signer);
  }

  async createProgram(input: {
    nodeId: string;
    investors: string[];
    amounts: bigint[];
    startAt: bigint;
    endAt: bigint;
    settlementCycle: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  }): Promise<{ programId: bigint; txHash: string } | null> {
    const c = this.contract;
    if (!c) {
      this.logger.debug('RevenueRight: コントラクト未設定。createProgram をスキップ。');
      return null;
    }

    try {
      const tx = await c.createProgram(
        input.nodeId as `0x${string}`,
        input.investors as `0x${string}`[],
        input.amounts,
        input.startAt,
        input.endAt,
        input.settlementCycle,
      );
      const receipt = await tx.wait();

      const event = receipt?.logs
        .map((l) => { try { return c.interface.parseLog(l as any); } catch { return null; } })
        .find((e) => e?.name === 'ProgramCreated');

      if (!event) throw new Error('ProgramCreated イベントが見つかりません');

      return {
        programId: event.args.programId as bigint,
        txHash: receipt!.hash,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`createProgram 失敗: ${msg}`);
      return null;
    }
  }

  async recordAllocation(input: {
    programId: bigint;
    totalAmountJpyc: bigint;
    periodStart: bigint;
    periodEnd: bigint;
  }): Promise<{ allocationId: bigint; txHash: string } | null> {
    const c = this.contract;
    if (!c) {
      this.logger.debug('RevenueRight: コントラクト未設定。recordAllocation をスキップ。');
      return null;
    }

    try {
      const tx = await c.recordAllocation(
        input.programId,
        input.totalAmountJpyc,
        input.periodStart,
        input.periodEnd,
      );
      const receipt = await tx.wait();

      const event = receipt?.logs
        .map((l) => { try { return c.interface.parseLog(l as any); } catch { return null; } })
        .find((e) => e?.name === 'AllocationRecorded');

      if (!event) throw new Error('AllocationRecorded イベントが見つかりません');

      return {
        allocationId: event.args.allocationId as bigint,
        txHash: receipt!.hash,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`recordAllocation 失敗: ${msg}`);
      return null;
    }
  }
}
