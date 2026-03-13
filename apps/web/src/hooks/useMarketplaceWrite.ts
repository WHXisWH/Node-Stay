'use client';

// useMarketplaceWrite — マーケットプレイス書き込み操作 Hook
// social ログイン時は AA、通常ログイン時は wagmi で送信する

import { useState } from 'react';
import { useWriteContract } from 'wagmi';
import { parseUnits } from 'viem';

import { CONTRACT_ADDRESSES } from '../services/config';
import { useUserStore } from '../stores/user.store';
import { useAaTransaction } from './useAaTransaction';
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

// ERC-721 approve ABI（minimum）
const ERC721_APPROVE_ABI = [
  { name: 'approve', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }, { name: 'tokenId', type: 'uint256' }],
    outputs: [] },
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

export function useMarketplaceWrite() {
  const { writeContractAsync } = useWriteContract();
  const loginMethod = useUserStore((s) => s.loginMethod);
  const mode = loginMethod === 'social' ? 'aa' : 'wallet';
  const { sendUserOp, error: aaError } = useAaTransaction();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // NFT 出品（approve → createListing）
  const listUsageRight = async (onchainTokenId: string, priceJpycMinor: string): Promise<string | null> => {
    setPending(true);
    setError(null);
    try {
      if (mode === 'aa') {
        const result = await sendUserOp([
          {
            to: USAGE_RIGHT_ADDRESS,
            data: encodeUsageRightApprove(MARKETPLACE_ADDRESS, BigInt(onchainTokenId)),
            value: 0n,
          },
          {
            to: MARKETPLACE_ADDRESS,
            data: encodeCreateListing(BigInt(onchainTokenId), BigInt(priceJpycMinor)),
            value: 0n,
          },
        ]);
        if (!result) {
          setError(aaError ?? 'AA での出品トランザクション送信に失敗しました');
          return null;
        }
        return result.txHash;
      }

      // 手順1: ERC-721 approve(marketplace, tokenId)
      await writeContractAsync({
        address: USAGE_RIGHT_ADDRESS,
        abi: ERC721_APPROVE_ABI,
        functionName: 'approve',
        args: [MARKETPLACE_ADDRESS, BigInt(onchainTokenId)],
      });
      // approve トランザクションの確定待機は省略可能（同一ブロック想定）

      // 手順2: createListing(tokenId, priceJpyc)
      const priceWei = parseUnits(priceJpycMinor, 0); // minor は整数
      const listTx = await writeContractAsync({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: 'createListing',
        args: [BigInt(onchainTokenId), priceWei],
      });
      return listTx;
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
      if (mode === 'aa') {
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
          setError(aaError ?? 'AA での購入トランザクション送信に失敗しました');
          return null;
        }
        return result.txHash;
      }

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
      if (mode === 'aa') {
        const result = await sendUserOp([
          {
            to: MARKETPLACE_ADDRESS,
            data: encodeCancelListing(BigInt(onchainListingId)),
            value: 0n,
          },
        ]);
        if (!result) {
          setError(aaError ?? 'AA での出品取消トランザクション送信に失敗しました');
          return null;
        }
        return result.txHash;
      }

      const tx = await writeContractAsync({
        address: MARKETPLACE_ADDRESS,
        abi: MARKETPLACE_ABI,
        functionName: 'cancelListing',
        args: [BigInt(onchainListingId)],
      });
      return tx;
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
