'use client';

/**
 * useWalletSync
 * wagmi の接続状態を useUserStore の connectedWalletAddress に同期するブリッジ Hook。
 * Header など最上位コンポーネントで一度だけ呼び出す。
 * ソーシャルログイン中は Web3Auth アドレスを優先するため wagmi の同期をスキップする。
 */

import { useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import { useUserStore } from '../stores/user.store';

export function useWalletSync() {
  const { address, isConnected } = useAccount();
  const setConnectedWalletAddress = useUserStore((s) => s.setConnectedWalletAddress);
  const loginMethod = useUserStore((s) => s.loginMethod);
  const prevWagmiAddressRef = useRef<`0x${string}` | null>(null);

  useEffect(() => {
    // ソーシャルログイン中は Web3Auth のアドレスを優先し、wagmi の同期で上書きしない
    if (loginMethod === 'social') {
      if (isConnected && address) {
        prevWagmiAddressRef.current = address;
      } else if (!isConnected) {
        prevWagmiAddressRef.current = null;
      }
      return;
    }

    if (isConnected && address) {
      prevWagmiAddressRef.current = address;
      setConnectedWalletAddress(address);
      return;
    }

    // wagmi が切断された場合、以前に同期したアドレスをクリアする
    if (
      !isConnected &&
      prevWagmiAddressRef.current
    ) {
      setConnectedWalletAddress(null);
    }

    if (!isConnected) {
      prevWagmiAddressRef.current = null;
    }
  }, [address, isConnected, loginMethod, setConnectedWalletAddress]);
}
