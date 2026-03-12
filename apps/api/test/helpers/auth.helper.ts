import jwt from 'jsonwebtoken';
import type { SignOptions } from 'jsonwebtoken';

const TEST_JWT_SECRET = 'test-jwt-secret-for-testing-only';

const TEST_WALLET = '0x1234567890abcdef1234567890abcdef12345678';
const TEST_WALLET_2 = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';

export function getTestJwtSecret(): string {
  return TEST_JWT_SECRET;
}

export function getTestWallet(): string {
  return TEST_WALLET;
}

export function getTestWallet2(): string {
  return TEST_WALLET_2;
}

export function createTestToken(address: string = TEST_WALLET, expiresIn = '24h'): string {
  const opts: SignOptions = { expiresIn: expiresIn as `${number}${'s' | 'm' | 'h' | 'd'}` };
  return jwt.sign(
    { sub: address.toLowerCase(), address: address.toLowerCase() },
    TEST_JWT_SECRET,
    opts,
  );
}

export function createExpiredToken(address: string = TEST_WALLET): string {
  const opts: SignOptions = { expiresIn: '0s' as `${number}${'s' | 'm' | 'h' | 'd'}` };
  return jwt.sign(
    { sub: address.toLowerCase(), address: address.toLowerCase() },
    TEST_JWT_SECRET,
    opts,
  );
}

export function authHeader(token: string): [string, string] {
  return ['Authorization', `Bearer ${token}`];
}
