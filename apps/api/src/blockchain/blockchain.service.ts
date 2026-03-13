import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ethers } from 'ethers';

@Injectable()
export class BlockchainService implements OnModuleInit {
  private readonly logger = new Logger(BlockchainService.name);
  private _provider: ethers.JsonRpcProvider | null = null;
  private _signer: ethers.Wallet | null = null;

  get isEnabled(): boolean {
    return this._provider !== null && this._signer !== null;
  }

  get provider(): ethers.JsonRpcProvider {
    if (!this._provider) throw new Error('BlockchainService: provider が未初期化です');
    return this._provider;
  }

  get signer(): ethers.Wallet {
    if (!this._signer) throw new Error('BlockchainService: signer が未初期化です');
    return this._signer;
  }

  private strictModeEnabled(): boolean {
    return process.env.STRICT_ONCHAIN_MODE !== 'false';
  }

  private async readOperatorAddress(
    provider: ethers.JsonRpcProvider,
    contractAddress: string,
  ): Promise<string | null> {
    try {
      // operator() selector
      const data = await provider.call({
        to: contractAddress,
        data: '0x570ca735',
      });
      if (!data || data === '0x' || data.length < 66) return null;
      return ethers.getAddress(`0x${data.slice(-40)}`);
    } catch {
      return null;
    }
  }

  private async assertContractOperator(
    provider: ethers.JsonRpcProvider,
    label: string,
    address: string | undefined,
    expectedOperator: string,
  ): Promise<void> {
    if (!address) {
      this.logger.warn(`[chain.check] ${label}: アドレス未設定`);
      if (this.strictModeEnabled()) {
        throw new Error(`${label} address is missing`);
      }
      return;
    }
    if (!ethers.isAddress(address)) {
      this.logger.error(`[chain.check] ${label}: アドレス形式が不正 address=${address}`);
      throw new Error(`${label} address is invalid`);
    }

    const code = await provider.getCode(address);
    if (!code || code === '0x') {
      this.logger.error(`[chain.check] ${label}: コントラクト未デプロイ address=${address}`);
      throw new Error(`${label} is not deployed`);
    }

    const operator = await this.readOperatorAddress(provider, address);
    if (!operator) {
      this.logger.warn(`[chain.check] ${label}: operator() を取得できませんでした address=${address}`);
      if (this.strictModeEnabled()) {
        throw new Error(`${label} operator check failed`);
      }
      return;
    }

    const ok = operator.toLowerCase() === expectedOperator.toLowerCase();
    if (ok) {
      this.logger.log(`[chain.check] ${label}: operator OK (${operator})`);
      return;
    }

    this.logger.error(
      `[chain.check] ${label}: operator 不一致 expected=${expectedOperator} actual=${operator}`,
    );
    if (this.strictModeEnabled()) {
      throw new Error(`${label} operator mismatch`);
    }
  }

  async onModuleInit() {
    const rpcUrl = process.env.AMOY_RPC_URL;
    const privateKey = process.env.OPERATOR_PRIVATE_KEY;

    if (!rpcUrl || !privateKey) {
      this.logger.warn('AMOY_RPC_URL または OPERATOR_PRIVATE_KEY が未設定です');
      return;
    }

    try {
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const signer = new ethers.Wallet(privateKey, provider);
      const network = await provider.getNetwork();
      this.logger.log(
        `ブロックチェーン接続完了 chainId=${network.chainId.toString()} signer=${signer.address}`,
      );

      await this.assertContractOperator(
        provider,
        'UsageRight',
        process.env.USAGE_RIGHT_ADDRESS ?? process.env.ACCESS_PASS_NFT_ADDRESS,
        signer.address,
      );
      await this.assertContractOperator(
        provider,
        'Settlement',
        process.env.SETTLEMENT_ADDRESS,
        signer.address,
      );
      await this.assertContractOperator(
        provider,
        'MachineRegistry',
        process.env.MACHINE_REGISTRY_ADDRESS,
        signer.address,
      );
      await this.assertContractOperator(
        provider,
        'ComputeRight',
        process.env.COMPUTE_RIGHT_ADDRESS,
        signer.address,
      );
      await this.assertContractOperator(
        provider,
        'RevenueRight',
        process.env.REVENUE_RIGHT_ADDRESS,
        signer.address,
      );

      // 初期化が最後まで成功した時点でのみ公開状態へ反映する
      this._provider = provider;
      this._signer = signer;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.error(`ブロックチェーン初期化に失敗しました: ${msg}`);
      this._provider = null;
      this._signer = null;
    }
  }
}
