'use client';

/**
 * Web3Provider — wagmi + TanStack Query のプロバイダをまとめたクライアントコンポーネント
 * RootLayout（Server Component）から children をラップして使用する
 */

import { type ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { wagmiConfig } from '../lib/wagmi';

// QueryClient はコンポーネント外で生成してシングルトンにする
const queryClient = new QueryClient();

export function Web3Provider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}
