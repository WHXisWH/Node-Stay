import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ethers } from 'ethers';

/**
 * BlockchainService
 * ethers.js provider / signer を一元管理するサービス。
 * コントラクト未デプロイ（アドレス未設定）の場合は graceful に無効化する。
 */
@Injectable()
export class BlockchainService implements OnModuleInit {
  private readonly logger = new Logger(BlockchainService.name);
  private _provider: ethers.JsonRpcProvider | null = null;
  private _signer: ethers.Wallet | null = null;

  // チェーン連携が有効かどうか
  get isEnabled(): boolean {
    return this._provider !== null && this._signer !== null;
  }

  get provider(): ethers.JsonRpcProvider {
    if (!this._provider) throw new Error('BlockchainService: プロバイダが初期化されていません');
    return this._provider;
  }

  get signer(): ethers.Wallet {
    if (!this._signer) throw new Error('BlockchainService: Signer が初期化されていません');
    return this._signer;
  }

  async onModuleInit() {
    const rpcUrl     = process.env.AMOY_RPC_URL;
    const privateKey = process.env.OPERATOR_PRIVATE_KEY;

    if (!rpcUrl || !privateKey) {
      this.logger.warn('AMOY_RPC_URL または OPERATOR_PRIVATE_KEY が未設定。チェーン連携は無効。');
      return;
    }

    try {
      this._provider = new ethers.JsonRpcProvider(rpcUrl);
      this._signer   = new ethers.Wallet(privateKey, this._provider);

      const network = await this._provider.getNetwork();
      this.logger.log(`チェーン接続完了: chainId=${network.chainId}, signer=${this._signer.address}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`チェーン接続失敗（オフライン続行）: ${msg}`);
      this._provider = null;
      this._signer   = null;
    }
  }
}
