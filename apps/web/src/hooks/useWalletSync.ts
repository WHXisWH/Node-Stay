'use client';

/**
 * useWalletSync
 * wagmi の接続状態を useUserStore に同期するブリッジ Hook。
 * Header など最上位コンポーネントで一度だけ呼び出す。
 */

import { useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import { useUserStore } from '../stores/user.store';

export function useWalletSync() {
  const { address, isConnected } = useAccount();
  const setWalletAddress = useUserStore((s) => s.setWalletAddress);
  const prevWagmiAddressRef = useRef<`0x${string}` | null>(null);

  useEffect(() => {
    const currentStoreAddress = useUserStore.getState().walletAddress;

    if (isConnected && address) {
      prevWagmiAddressRef.current = address;
      setWalletAddress(address);
      return;
    }

    if (
      !isConnected &&
      prevWagmiAddressRef.current &&
      currentStoreAddress?.toLowerCase() === prevWagmiAddressRef.current.toLowerCase()
    ) {
      setWalletAddress(null);
    }

    if (!isConnected) {
      prevWagmiAddressRef.current = null;
    }
  }, [address, isConnected, setWalletAddress]);
}
