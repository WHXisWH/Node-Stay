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
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes('User rejected')) setError(msg);
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
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes('User rejected')) setError(msg);
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
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes('User rejected')) setError(msg);
      return null;
    } finally {
      setPending(false);
    }
  };

  return { listUsageRight, buyListing, cancelListing, pending, error };
}
