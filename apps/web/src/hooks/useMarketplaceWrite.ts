'use client';

// useMarketplaceWrite — マーケットプレイス書き込み操作 Hook
// NodeStayMarketplace / NodeStayUsageRight / JPYC コントラクトを直接呼び出す

import { useState } from 'react';
import { useWriteContract } from 'wagmi';
import { parseUnits } from 'viem';

import { CONTRACT_ADDRESSES } from '../services/config';

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
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // NFT 出品（approve → createListing）
  const listUsageRight = async (onchainTokenId: string, priceJpycMinor: string): Promise<string | null> => {
    setPending(true);
    setError(null);
    try {
      // Step 1: ERC-721 approve(marketplace, tokenId)
      await writeContractAsync({
        address: USAGE_RIGHT_ADDRESS,
        abi: ERC721_APPROVE_ABI,
        functionName: 'approve',
        args: [MARKETPLACE_ADDRESS, BigInt(onchainTokenId)],
      });
      // approve tx 待機は任意（同一ブロック内で可）

      // Step 2: createListing(tokenId, priceJpyc)
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
      // Step 1: JPYC approve(marketplace, price)
      await writeContractAsync({
        address: JPYC_ADDRESS,
        abi: ERC20_APPROVE_ABI,
        functionName: 'approve',
        args: [MARKETPLACE_ADDRESS, parseUnits(priceJpycMinor, 0)],
      });

      // Step 2: buyListing(listingId)
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
