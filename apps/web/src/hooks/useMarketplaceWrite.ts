'use client';

// useMarketplaceWrite — マーケットプレイス書き込み操作 Hook
// social ログイン時は AA、通常ログイン時は wagmi で送信する

import { useState } from 'react';
import { useAccount, useWriteContract } from 'wagmi';
import { createPublicClient, http, isAddress, parseUnits } from 'viem';

import { CHAIN_CONFIG, CONTRACT_ADDRESSES } from '../services/config';
import { useUserStore } from '../stores/user.store';
import { useAaTransaction } from './useAaTransaction';
import { resolveTxMode } from './txMode';
import {
  encodeBuyListing,
  encodeCancelListing,
  encodeCreateListing,
  encodeJpycApprove,
  encodeUsageRightApprove,
} from '../services/aa/encodeMarketplaceCalls';

const MARKETPLACE_ADDRESS = CONTRACT_ADDRESSES.marketplace as `0x${string}`;
const USAGE_RIGHT_ADDRESS = CONTRACT_ADDRESSES.usageRight as `0x${string}`;
const JPYC_ADDRESS = CONTRACT_ADDRESSES.jpycToken as `0x${string}`;

const publicClient = createPublicClient({
  transport: http(CHAIN_CONFIG.rpcUrl),
});

// ERC-721 approve ABI（minimum）
const ERC721_APPROVE_ABI = [
  { name: 'approve', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }, { name: 'tokenId', type: 'uint256' }],
    outputs: [] },
] as const;

const ERC721_OWNER_OF_ABI = [
  { name: 'ownerOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: 'owner', type: 'address' }] },
] as const;

// ERC-20 approve ABI
const ERC20_APPROVE_ABI = [
  { name: 'approve', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }] },
] as const;

// Marketplace ABI（createListing / cancelListing / buyListing）
const MARKETPLACE_ABI = [
  { name: 'createListing', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'tokenId', type: 'uint256' }, { name: 'priceJpyc', type: 'uint256' }],
    outputs: [{ name: 'listingId', type: 'uint256' }] },
  { name: 'cancelListing', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'listingId', type: 'uint256' }], outputs: [] },
  { name: 'buyListing', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'listingId', type: 'uint256' }], outputs: [] },
] as const;

function isConnectorNotConnectedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /connector not connected/i.test(message);
}

function parseMarketplaceWriteError(error: unknown, action: 'list' | 'buy' | 'cancel'): string {
  const fallbackMap: Record<typeof action, string> = {
    list: '出品トランザクションの送信に失敗しました。',
    buy: '購入トランザクションの送信に失敗しました。',
    cancel: '出品取消トランザクションの送信に失敗しました。',
  };
  const raw = error instanceof Error ? error.message : String(error ?? '');
  if (!raw) return fallbackMap[action];
  if (/user rejected|rejected the request/i.test(raw)) return '署名がキャンセルされました。';
  if (/connector not connected/i.test(raw)) return 'ウォレット接続が切断されています。再ログインしてください。';
  if (raw.includes('0x59dc379f') || raw.includes('NotTokenOwner')) {
    return 'この利用権の所有者ではないため出品できません。';
  }
  if (raw.includes('0xa22b745e') || raw.includes('CooldownNotElapsed')) {
    return 'この利用権は購入直後のため、24時間経過するまで再出品できません。';
  }
  if (raw.includes('0x66cb03e9') || raw.includes('ListingNotActive')) {
    return 'この出品はすでに無効です。画面を更新してください。';
  }
  if (raw.includes('0x5ec82351') || raw.includes('NotSeller')) {
    return '出品者本人のみ取消できます。';
  }
  if (raw.includes('0x2aa3c9e9') || raw.includes('SellerCannotBuy')) {
    return '自分の出品は購入できません。';
  }
  if (raw.includes('0x0f603df8') || raw.includes('TransferCutoffPassed')) {
    return '譲渡期限を過ぎているため出品できません。';
  }
  if (raw.includes('0xdf978235') || raw.includes('MaxTransferCountReached')) {
    return '譲渡回数の上限に達しているため出品できません。';
  }
  if (raw.includes('0x177e802f') || /insufficient approval|ERC721InsufficientApproval/i.test(raw)) {
    return 'NFT の承認に失敗しました。しばらく待ってから再試行してください。';
  }
  if (/UserOperation reverted during simulation/i.test(raw)) {
    return 'AA シミュレーションでトランザクションが拒否されました。利用権の譲渡条件と所有者を確認してください。';
  }
  return fallbackMap[action];
}

export function useMarketplaceWrite() {
  const { writeContractAsync } = useWriteContract();
  const loginMethod = useUserStore((s) => s.loginMethod);
  const aaWalletAddress = useUserStore((s) => s.aaWalletAddress);
  const socialWalletAddress = useUserStore((s) => s.socialWalletAddress);
  const authWalletAddress = useUserStore((s) => s.walletAddress);
  const { address: connectedAddress, isConnected } = useAccount();
  const mode = resolveTxMode(loginMethod, isConnected);
  const { sendUserOp } = useAaTransaction();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sameAddress = (a?: string | null, b?: string | null) =>
    !!a && !!b && a.toLowerCase() === b.toLowerCase();

  // NFT 出品（approve → createListing）
  const listUsageRight = async (onchainTokenId: string, priceJpycMinor: string): Promise<string | null> => {
    setPending(true);
    setError(null);
    try {
      const tokenId = BigInt(onchainTokenId);
      const ownerOnChain = await publicClient.readContract({
        address: USAGE_RIGHT_ADDRESS,
        abi: ERC721_OWNER_OF_ABI,
        functionName: 'ownerOf',
        args: [tokenId],
      }) as `0x${string}`;

      // SNS 認証中でも owner が接続済みウォレットと一致する場合は wallet 経路を優先する。
      const effectiveMode = mode === 'aa' && sameAddress(ownerOnChain, connectedAddress ?? null)
        ? 'wallet'
        : mode;

      if (effectiveMode === 'aa') {
        if (!aaWalletAddress || !isAddress(aaWalletAddress)) {
          throw new Error('AAウォレットが未初期化です。右上メニューから AA ウォレットを初期化してください。');
        }
        if (!sameAddress(ownerOnChain, aaWalletAddress)) {
          const ownerLabel = sameAddress(ownerOnChain, socialWalletAddress) || sameAddress(ownerOnChain, authWalletAddress)
            ? 'EOA所有者'
            : '別ウォレット';
          throw new Error(
            `この利用権の所有者は ${ownerOnChain}（${ownerLabel}）です。現在のAAウォレット ${aaWalletAddress} では出品できません。先にこの利用権を AA ウォレットへ譲渡してください。`,
          );
        }
      } else {
        if (!connectedAddress || !isAddress(connectedAddress)) {
          throw new Error('ウォレット未接続のため出品できません。');
        }
        if (!sameAddress(ownerOnChain, connectedAddress)) {
          throw new Error(
            `この利用権の所有者は ${ownerOnChain} です。接続中ウォレット ${connectedAddress} では出品できません。`,
          );
        }
      }

      const sendViaAa = async () => {
        const result = await sendUserOp([
          {
            to: USAGE_RIGHT_ADDRESS,
            data: encodeUsageRightApprove(MARKETPLACE_ADDRESS, tokenId),
            value: 0n,
          },
          {
            to: MARKETPLACE_ADDRESS,
            data: encodeCreateListing(tokenId, BigInt(priceJpycMinor)),
            value: 0n,
          },
        ]);
        if (!result) {
          throw new Error('AA での出品トランザクション送信に失敗しました');
        }
        return result.txHash;
      };

      if (effectiveMode === 'aa') {
        return await sendViaAa();
      }

      try {
        // 手順1: ERC-721 approve(marketplace, tokenId)
        await writeContractAsync({
          address: USAGE_RIGHT_ADDRESS,
          abi: ERC721_APPROVE_ABI,
          functionName: 'approve',
          args: [MARKETPLACE_ADDRESS, tokenId],
        });
        // approve トランザクションの確定待機は省略可能（同一ブロック想定）

        // 手順2: createListing(tokenId, priceJpyc)
        const priceWei = parseUnits(priceJpycMinor, 0); // minor は整数
        const listTx = await writeContractAsync({
          address: MARKETPLACE_ADDRESS,
          abi: MARKETPLACE_ABI,
          functionName: 'createListing',
          args: [tokenId, priceWei],
        });
        return listTx;
      } catch (walletError) {
        if (loginMethod !== 'wallet' && isConnectorNotConnectedError(walletError) && effectiveMode === 'wallet') {
          return await sendViaAa();
        }
        throw walletError;
      }
    } catch (e: unknown) {
      setError(parseMarketplaceWriteError(e, 'list'));
      return null;
    } finally {
      setPending(false);
    }
  };

  // 購入（JPYC approve → buyListing）
  const buyListing = async (onchainListingId: string, priceJpycMinor: string): Promise<string | null> => {
    setPending(true);
    setError(null);
    try {
      const sendViaAa = async () => {
        const result = await sendUserOp([
          {
            to: JPYC_ADDRESS,
            data: encodeJpycApprove(MARKETPLACE_ADDRESS, parseUnits(priceJpycMinor, 0)),
            value: 0n,
          },
          {
            to: MARKETPLACE_ADDRESS,
            data: encodeBuyListing(BigInt(onchainListingId)),
            value: 0n,
          },
        ]);
        if (!result) {
          throw new Error('AA での購入トランザクション送信に失敗しました');
        }
        return result.txHash;
      };

      if (mode === 'aa') {
        return await sendViaAa();
      }

      try {
        // 手順1: JPYC approve(marketplace, price)
        await writeContractAsync({
          address: JPYC_ADDRESS,
          abi: ERC20_APPROVE_ABI,
          functionName: 'approve',
          args: [MARKETPLACE_ADDRESS, parseUnits(priceJpycMinor, 0)],
        });

        // 手順2: buyListing(listingId)
        const buyTx = await writeContractAsync({
          address: MARKETPLACE_ADDRESS,
          abi: MARKETPLACE_ABI,
          functionName: 'buyListing',
          args: [BigInt(onchainListingId)],
        });
        return buyTx;
      } catch (walletError) {
        if (loginMethod !== 'wallet' && isConnectorNotConnectedError(walletError)) {
          return await sendViaAa();
        }
        throw walletError;
      }
    } catch (e: unknown) {
      setError(parseMarketplaceWriteError(e, 'buy'));
      return null;
    } finally {
      setPending(false);
    }
  };

  // 出品キャンセル
  const cancelListing = async (onchainListingId: string): Promise<string | null> => {
    setPending(true);
    setError(null);
    try {
      const sendViaAa = async () => {
        const result = await sendUserOp([
          {
            to: MARKETPLACE_ADDRESS,
            data: encodeCancelListing(BigInt(onchainListingId)),
            value: 0n,
          },
        ]);
        if (!result) {
          throw new Error('AA での出品取消トランザクション送信に失敗しました');
        }
        return result.txHash;
      };

      if (mode === 'aa') {
        return await sendViaAa();
      }

      try {
        const tx = await writeContractAsync({
          address: MARKETPLACE_ADDRESS,
          abi: MARKETPLACE_ABI,
          functionName: 'cancelListing',
          args: [BigInt(onchainListingId)],
        });
        return tx;
      } catch (walletError) {
        if (loginMethod !== 'wallet' && isConnectorNotConnectedError(walletError)) {
          return await sendViaAa();
        }
        throw walletError;
      }
    } catch (e: unknown) {
      setError(parseMarketplaceWriteError(e, 'cancel'));
      return null;
    } finally {
      setPending(false);
    }
  };

  return { listUsageRight, buyListing, cancelListing, pending, error };
}
