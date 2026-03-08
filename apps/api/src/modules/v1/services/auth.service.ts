import { Injectable } from '@nestjs/common';
import { SiweMessage } from 'siwe';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';

/** nonce の有効期限（5分） */
const NONCE_TTL_MS = 5 * 60 * 1000;

interface NonceEntry {
  nonce: string;
  expiresAt: number;
}

@Injectable()
export class AuthService {
  /** アドレスごとのワンタイム nonce を保持するインメモリマップ */
  private readonly nonceStore = new Map<string, NonceEntry>();

  // ---------------------------------------------------------------------------
  // Nonce 生成
  // ---------------------------------------------------------------------------

  /** 指定アドレス向けの nonce を生成して返す */
  generateNonce(address: string): string {
    const nonce = crypto.randomBytes(16).toString('hex');
    this.nonceStore.set(address.toLowerCase(), {
      nonce,
      expiresAt: Date.now() + NONCE_TTL_MS,
    });
    return nonce;
  }

  // ---------------------------------------------------------------------------
  // SIWE 検証 → JWT 発行
  // ---------------------------------------------------------------------------

  /**
   * SIWE メッセージと署名を検証し、有効であれば JWT を返す。
   * @throws 検証失敗時に Error をスロー
   */
  async verifyAndIssueToken(rawMessage: string, signature: string): Promise<string> {
    const siwe = new SiweMessage(rawMessage);

    // 署名を検証（ethers.js 相当の ECDSA リカバリを内部実行）
    const result = await siwe.verify({ signature });
    if (!result.success) {
      throw new Error('署名の検証に失敗しました');
    }

    const address = siwe.address.toLowerCase();

    // nonce の一致・有効期限チェック
    const entry = this.nonceStore.get(address);
    if (!entry || entry.nonce !== siwe.nonce || Date.now() > entry.expiresAt) {
      throw new Error('nonce が無効または期限切れです');
    }

    // 使用済み nonce を削除（リプレイ攻撃防止）
    this.nonceStore.delete(address);

    // JWT を発行（有効期限 24 時間）
    const secret = process.env.JWT_SECRET ?? 'nodestay-dev-secret';
    const token = jwt.sign(
      { sub: address, address },
      secret,
      { expiresIn: '24h' },
    );

    return token;
  }

  // ---------------------------------------------------------------------------
  // JWT 検証
  // ---------------------------------------------------------------------------

  /** Authorization ヘッダー等から JWT を検証し、ウォレットアドレスを返す */
  verifyToken(token: string): { address: string } {
    const secret = process.env.JWT_SECRET ?? 'nodestay-dev-secret';
    const payload = jwt.verify(token, secret) as { address: string };
    return { address: payload.address };
  }
}
