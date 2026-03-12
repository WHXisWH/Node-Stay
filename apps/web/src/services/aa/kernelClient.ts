/**
 * AA Kernel クライアント
 * ZeroDev SDK を使用して AA ウォレット（Kernel Account）を構築する。
 * Web3Auth 経由のソーシャルログイン後に利用可能。
 */

import type { IProvider } from '@web3auth/modal';
import { signerToEcdsaValidator } from '@zerodev/ecdsa-validator';
import { createKernelAccount } from '@zerodev/sdk/accounts';
import { createKernelAccountClient } from '@zerodev/sdk/clients';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  isAddress,
  type Address,
} from 'viem';
import { entryPoint07Address } from 'viem/account-abstraction';
import { polygon, polygonAmoy } from 'viem/chains';
import { CHAIN_CONFIG } from '../config';

const DEFAULT_KERNEL_VERSION = '0.3.1' as const;

export interface AaKernelContext {
  ownerAddress: Address;
  smartAccountAddress: Address;
  kernelClient: ReturnType<typeof createKernelAccountClient>;
}

const contextCache = new Map<string, AaKernelContext>();

function resolveChain() {
  if (CHAIN_CONFIG.id === polygon.id) return polygon;
  return polygonAmoy;
}

function requiredEnv(name: string, value?: string): string {
  if (value && value.trim()) return value;
  throw new Error(`${name} が未設定です。AA 機能を利用するには環境変数を設定してください。`);
}

export async function buildKernelClient(provider: IProvider): Promise<AaKernelContext> {
  const chain = resolveChain();
  const bundlerRpcUrl = requiredEnv('NEXT_PUBLIC_BUNDLER_RPC_URL', process.env.NEXT_PUBLIC_BUNDLER_RPC_URL);
  const paymasterRpcUrl = process.env.NEXT_PUBLIC_PAYMASTER_RPC_URL || bundlerRpcUrl;
  const entryPointAddress = (process.env.NEXT_PUBLIC_ENTRYPOINT_ADDRESS || entryPoint07Address) as Address;
  const kernelFactoryAddress = process.env.NEXT_PUBLIC_KERNEL_FACTORY_ADDRESS;

  const publicClient = createPublicClient({
    chain,
    transport: http(CHAIN_CONFIG.rpcUrl),
  });

  const ownerWalletClient = createWalletClient({
    chain,
    transport: custom(provider as never),
  });

  const [ownerAddress] = await ownerWalletClient.getAddresses();
  if (!ownerAddress) {
    throw new Error('Web3Auth からウォレットアドレスを取得できませんでした。');
  }

  const cacheKey = ownerAddress.toLowerCase();
  const cached = contextCache.get(cacheKey);
  if (cached) return cached;

  const ownerSigner = createWalletClient({
    chain,
    account: ownerAddress,
    transport: custom(provider as never),
  });

  const ecdsaValidator = await signerToEcdsaValidator(publicClient, {
    signer: ownerSigner,
    entryPoint: {
      address: entryPointAddress,
      version: '0.7',
    },
    kernelVersion: DEFAULT_KERNEL_VERSION,
  });

  const kernelAccount = await createKernelAccount(publicClient, {
    entryPoint: {
      address: entryPointAddress,
      version: '0.7',
    },
    kernelVersion: DEFAULT_KERNEL_VERSION,
    plugins: {
      sudo: ecdsaValidator,
    },
    ...(kernelFactoryAddress && isAddress(kernelFactoryAddress)
      ? { factoryAddress: kernelFactoryAddress as Address }
      : {}),
  });

  const pimlicoClient = createPimlicoClient({
    chain,
    transport: http(paymasterRpcUrl),
    entryPoint: {
      address: entryPointAddress,
      version: '0.7',
    },
  });

  const kernelClient = createKernelAccountClient({
    account: kernelAccount,
    chain,
    client: publicClient,
    bundlerTransport: http(bundlerRpcUrl),
    paymaster: {
      getPaymasterData: (args) => pimlicoClient.getPaymasterData(args),
      getPaymasterStubData: (args) => pimlicoClient.getPaymasterStubData(args),
    },
  });

  const context: AaKernelContext = {
    ownerAddress,
    smartAccountAddress: kernelAccount.address,
    kernelClient,
  };
  contextCache.set(cacheKey, context);
  return context;
}

export function clearAaKernelClientCache(): void {
  contextCache.clear();
}
