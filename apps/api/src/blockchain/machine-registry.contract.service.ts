import { Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { BlockchainService } from './blockchain.service';

// typechain 生成ファクトリ
import { NodeStayMachineRegistry__factory } from '../../../../packages/contracts/typechain-types';

/**
 * MachineRegistryContractService
 * NodeStayMachineRegistry コントラクトの呼び出しをラップ。
 * コントラクトアドレス未設定の場合は全メソッドが null を返す（graceful degradation）。
 */
@Injectable()
export class MachineRegistryContractService {
  private readonly logger = new Logger(MachineRegistryContractService.name);

  constructor(private readonly blockchain: BlockchainService) {}

  private get contract() {
    const address = process.env.MACHINE_REGISTRY_ADDRESS;
    if (!address || !this.blockchain.isEnabled) return null;
    return NodeStayMachineRegistry__factory.connect(address, this.blockchain.signer);
  }

  /**
   * 機器をオンチェーンに登録する
   * @returns machineId（bytes32）と tx ハッシュ、失敗時は null
   */
  async registerMachine(input: {
    venueIdHash: string;   // bytes32 hex
    machineClass: number;  // MachineClass enum value
    specHash: string;      // bytes32 hex
    metadataUri: string;
  }): Promise<{ machineId: string; txHash: string } | null> {
    const c = this.contract;
    if (!c) {
      this.logger.debug('MachineRegistry: コントラクト未設定。オンチェーン登録をスキップ。');
      return null;
    }

    try {
      const tx = await c.registerMachine(
        input.venueIdHash,
        input.machineClass,
        input.specHash,
        input.metadataUri,
      );
      const receipt = await tx.wait();

      // MachineRegistered イベントから machineId を取得
      const event = receipt?.logs
        .map((l) => { try { return c.interface.parseLog(l as any); } catch { return null; } })
        .find((e) => e?.name === 'MachineRegistered');

      if (!event) throw new Error('MachineRegistered イベントが見つかりません');

      return {
        machineId: event.args.machineId as string,
        txHash:    receipt!.hash,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`registerMachine 失敗: ${msg}`);
      return null;
    }
  }

  /**
   * 機器ステータスをオンチェーンで更新する
   */
  async updateMachineStatus(machineId: string, status: number): Promise<string | null> {
    const c = this.contract;
    if (!c) return null;

    try {
      const tx = await c.updateMachineStatus(machineId, status);
      const receipt = await tx.wait();
      return receipt!.hash;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`updateMachineStatus 失敗: ${msg}`);
      return null;
    }
  }

  /**
   * オンチェーン機器情報を取得する
   */
  async getMachine(machineId: string) {
    const c = this.contract;
    if (!c) return null;

    try {
      return await c.getMachine(machineId);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`getMachine 失敗: ${msg}`);
      return null;
    }
  }
}
