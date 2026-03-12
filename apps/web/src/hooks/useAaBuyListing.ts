'use client';

/**
 * AA マーケットプレイス購入フック
 * JPYC approve + buyListing を単一の UserOperation で実行する。
 */

import { parseUnits, isAddress, type Address, type Hex } from 'viem';
import { CONTRACT_ADDRESSES } from '../services/config';
import { encodeBuyListing, encodeJpycApprove } from '../services/aa/encodeMarketplaceCalls';
import { useAaTransaction } from './useAaTransaction';

function resolveAddresses(): { marketplace: Address; jpyc: Address } {
  const marketplace = CONTRACT_ADDRESSES.marketplace;
  const jpyc = process.env.NEXT_PUBLIC_JPYC_ADDRESS ?? CONTRACT_ADDRESSES.jpycToken;
  if (!isAddress(marketplace)) {
    throw new Error('NEXT_PUBLIC_MARKETPLACE_ADDRESS が不正です。');
  }
  if (!isAddress(jpyc)) {
    throw new Error('NEXT_PUBLIC_JPYC_ADDRESS または NEXT_PUBLIC_JPYC_TOKEN_ADDRESS が不正です。');
  }
  return { marketplace, jpyc };
}

export interface UseAaBuyListingReturn {
  buyListing: (onchainListingId: string, priceJpycMinor: string) => Promise<{ userOpHash: Hex; txHash: Hex } | null>;
  pending: boolean;
  error: string | null;
  userOpHash: Hex | null;
  txHash: Hex | null;
}

export function useAaBuyListing(): UseAaBuyListingReturn {
  const { sendUserOp, status, error, userOpHash, txHash } = useAaTransaction();

  const buyListing = async (onchainListingId: string, priceJpycMinor: string) => {
    const { marketplace, jpyc } = resolveAddresses();
    const listingId = BigInt(onchainListingId);
    const priceMinor = parseUnits(priceJpycMinor, 0);

    const result = await sendUserOp([
      {
        to: jpyc,
        data: encodeJpycApprove(marketplace, priceMinor),
        value: 0n,
      },
      {
        to: marketplace,
        data: encodeBuyListing(listingId),
        value: 0n,
      },
    ]);

    return result;
  };

  return {
    buyListing,
    pending: status === 'sending',
    error,
    userOpHash,
    txHash,
  };
}
