/**
 * AA 呼び出しエンコーダー
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

const ERC20_TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

const ERC721_APPROVE_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
    outputs: [],
  },
] as const;

const ERC1155_SAFE_TRANSFER_FROM_ABI = [
  {
    name: 'safeTransferFrom',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'id', type: 'uint256' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ],
    outputs: [],
  },
] as const;

const MARKETPLACE_ABI = [
  {
    name: 'createListing',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'priceJpyc', type: 'uint256' },
    ],
    outputs: [{ name: 'listingId', type: 'uint256' }],
  },
  {
    name: 'cancelListing',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'listingId', type: 'uint256' }],
    outputs: [],
  },
  {
    name: 'buyListing',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'listingId', type: 'uint256' }],
    outputs: [],
  },
] as const;

const REVENUE_RIGHT_ABI = [
  {
    name: 'claim',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'programId', type: 'uint256' },
      { name: 'allocationId', type: 'uint256' },
    ],
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

export function encodeJpycTransfer(to: Address, amountWei: bigint): Hex {
  return encodeFunctionData({
    abi: ERC20_TRANSFER_ABI,
    functionName: 'transfer',
    args: [to, amountWei],
  });
}

export function encodeUsageRightApprove(to: Address, tokenId: bigint): Hex {
  return encodeFunctionData({
    abi: ERC721_APPROVE_ABI,
    functionName: 'approve',
    args: [to, tokenId],
  });
}

export function encodeCreateListing(tokenId: bigint, priceJpycMinor: bigint): Hex {
  return encodeFunctionData({
    abi: MARKETPLACE_ABI,
    functionName: 'createListing',
    args: [tokenId, priceJpycMinor],
  });
}

export function encodeCancelListing(listingId: bigint): Hex {
  return encodeFunctionData({
    abi: MARKETPLACE_ABI,
    functionName: 'cancelListing',
    args: [listingId],
  });
}

export function encodeBuyListing(listingId: bigint): Hex {
  return encodeFunctionData({
    abi: MARKETPLACE_ABI,
    functionName: 'buyListing',
    args: [listingId],
  });
}

export function encodeRevenueClaim(programId: bigint, allocationId: bigint): Hex {
  return encodeFunctionData({
    abi: REVENUE_RIGHT_ABI,
    functionName: 'claim',
    args: [programId, allocationId],
  });
}

export function encodeRevenueSafeTransferFrom(
  from: Address,
  to: Address,
  programId: bigint,
  amount: bigint,
): Hex {
  return encodeFunctionData({
    abi: ERC1155_SAFE_TRANSFER_FROM_ABI,
    functionName: 'safeTransferFrom',
    args: [from, to, programId, amount, '0x'],
  });
}
