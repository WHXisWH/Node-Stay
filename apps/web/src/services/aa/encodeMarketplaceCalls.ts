/**
 * AA マーケットプレイス呼び出しエンコーダー
 * UserOperation の callData を生成するためのヘルパー関数。
 */

import { encodeFunctionData, type Address, type Hex } from 'viem';

const ERC20_APPROVE_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

const MARKETPLACE_ABI = [
  {
    name: 'buyListing',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'listingId', type: 'uint256' }],
    outputs: [],
  },
] as const;

export function encodeJpycApprove(spender: Address, amountMinor: bigint): Hex {
  return encodeFunctionData({
    abi: ERC20_APPROVE_ABI,
    functionName: 'approve',
    args: [spender, amountMinor],
  });
}

export function encodeBuyListing(listingId: bigint): Hex {
  return encodeFunctionData({
    abi: MARKETPLACE_ABI,
    functionName: 'buyListing',
    args: [listingId],
  });
}
