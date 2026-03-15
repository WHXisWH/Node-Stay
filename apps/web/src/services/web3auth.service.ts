import { createWalletClient, custom } from 'viem';
import { CHAIN_CONFIG } from './config';
import { buildKernelClient } from './aa/kernelClient';

const CLIENT_ID = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID ?? '';
const REQUESTED_NETWORK = process.env.NEXT_PUBLIC_WEB3AUTH_NETWORK ?? 'sapphire_devnet';

type Web3AuthSdk = typeof import('@web3auth/modal');
type Web3AuthInstance = import('@web3auth/modal').Web3Auth;
type Web3AuthProvider = import('@web3auth/modal').IProvider;

let web3AuthPromise: Promise<Web3AuthInstance> | null = null;
let connectedProvider: Web3AuthProvider | null = null;

function resolveWeb3AuthNetwork(sdk: Web3AuthSdk): import('@web3auth/modal').WEB3AUTH_NETWORK_TYPE {
  const candidates = Object.values(sdk.WEB3AUTH_NETWORK) as string[];
  if (candidates.includes(REQUESTED_NETWORK)) {
    return REQUESTED_NETWORK as import('@web3auth/modal').WEB3AUTH_NETWORK_TYPE;
  }
  return sdk.WEB3AUTH_NETWORK.SAPPHIRE_DEVNET;
}

function buildChainConfig(sdk: Web3AuthSdk): import('@web3auth/modal').CustomChainConfig {
  return {
    chainNamespace: sdk.CHAIN_NAMESPACES.EIP155,
    chainId: `0x${CHAIN_CONFIG.id.toString(16)}`,
    rpcTarget: CHAIN_CONFIG.rpcUrl,
    displayName: CHAIN_CONFIG.name,
    logo: '/logo.svg',
    tickerName: 'POL',
    ticker: 'POL',
    blockExplorerUrl: process.env.NEXT_PUBLIC_CHAIN_EXPLORER_URL ?? 'https://amoy.polygonscan.com',
  };
}

async function getWeb3Auth(): Promise<Web3AuthInstance> {
  if (typeof window === 'undefined') {
    throw new Error('ブラウザ環境でのみソーシャルログインを利用できます。');
  }
  if (!CLIENT_ID) {
    throw new Error('NEXT_PUBLIC_WEB3AUTH_CLIENT_ID が未設定です。');
  }

  if (!web3AuthPromise) {
    web3AuthPromise = (async () => {
      const [sdk, auth] = await Promise.all([
        import('@web3auth/modal'),
        import('@web3auth/auth'),
      ]);

      const web3auth = new sdk.Web3Auth({
        clientId: CLIENT_ID,
        web3AuthNetwork: resolveWeb3AuthNetwork(sdk),
        chains: [buildChainConfig(sdk)],
        uiConfig: {
          defaultLanguage: 'ja',
          mode: 'light',
        },
        modalConfig: {
          hideWalletDiscovery: true,
          connectors: {
            [sdk.WALLET_CONNECTORS.AUTH]: {
              label: 'Social Login',
              loginMethods: {
                [auth.AUTH_CONNECTION.GOOGLE]: { showOnModal: true, mainOption: true, name: 'Google' },
                [auth.AUTH_CONNECTION.TWITTER]: { showOnModal: true, mainOption: true, name: 'X' },
                [auth.AUTH_CONNECTION.EMAIL_PASSWORDLESS]: { showOnModal: true, mainOption: true, name: 'Email' },
              },
            },
            [sdk.WALLET_CONNECTORS.METAMASK]: { label: 'MetaMask', showOnModal: false },
            [sdk.WALLET_CONNECTORS.WALLET_CONNECT_V2]: { label: 'WalletConnect', showOnModal: false },
            [sdk.WALLET_CONNECTORS.COINBASE]: { label: 'Coinbase', showOnModal: false },
          },
        },
      });
      await web3auth.init();
      return web3auth;
    })();
  }

  return web3AuthPromise;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function withTimeout<T>(task: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = globalThis.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([task, timeoutPromise]).finally(() => {
    if (timeoutId !== null) {
      globalThis.clearTimeout(timeoutId);
    }
  });
}

function isRecoverableSessionError(error: unknown): boolean {
  const message = errorMessage(error).toLowerCase();
  return (
    message.includes('session expired')
    || message.includes('invalid public key')
    || message.includes('not authenticated')
  );
}

async function resetWeb3Auth(): Promise<void> {
  if (web3AuthPromise) {
    const web3auth = await web3AuthPromise.catch(() => null);
    if (web3auth) {
      await web3auth.logout({ cleanup: true }).catch(() => {});
    }
  }
  web3AuthPromise = null;
  connectedProvider = null;
}

async function getWalletClient(provider: Web3AuthProvider) {
  return createWalletClient({
    transport: custom(provider as never),
  });
}

async function resolveAddress(provider: Web3AuthProvider): Promise<`0x${string}`> {
  const walletClient = await getWalletClient(provider);
  const addresses = await walletClient.getAddresses();
  const address = addresses[0];
  if (!address) {
    throw new Error('ウォレットアドレスを取得できませんでした。');
  }
  return address;
}

/**
 * Web3AuthService
 * ソーシャルログインのウォレット接続と再利用 provider を管理する。
 */
class Web3AuthServiceClass {
  /**
   * 既存セッションを使って provider を静かに復元する。
   * ここでは connect() を呼ばないため、未接続時にログインモーダルは開かない。
   */
  async restoreSocialSession(): Promise<{ address: `0x${string}` } | null> {
    const web3auth = await getWeb3Auth();
    if (!web3auth.connected || !web3auth.provider) {
      connectedProvider = null;
      return null;
    }
    connectedProvider = web3auth.provider;
    const address = await resolveAddress(web3auth.provider);
    return { address };
  }

  async connectSocial(): Promise<{ address: `0x${string}`; signMessage: (message: string) => Promise<string> }> {
    let provider: Web3AuthProvider | null = null;

    try {
      provider = await withTimeout(
        (await getWeb3Auth()).connect(),
        90000,
        'ソーシャルログインがタイムアウトしました。ブラウザのポップアップ設定を確認して再試行してください。',
      );
    } catch (error) {
      if (!isRecoverableSessionError(error)) {
        throw error;
      }

      // セッション破損時はインスタンスを作り直して 1 回だけ再試行する。
      await resetWeb3Auth();
      provider = await withTimeout(
        (await getWeb3Auth()).connect(),
        90000,
        'ソーシャルログインがタイムアウトしました。ブラウザのポップアップ設定を確認して再試行してください。',
      );
    }

    if (!provider) {
      throw new Error('ソーシャルログインの接続に失敗しました。');
    }
    connectedProvider = provider;
    const walletClient = await getWalletClient(provider);
    const address = await resolveAddress(provider);

    return {
      address,
      // viem WalletClient で署名を実行し、SIWE へ渡す
      signMessage: async (message: string) => walletClient.signMessage({ account: address, message }),
    };
  }

  async logout(): Promise<void> {
    await resetWeb3Auth();
  }

  /**
   * 接続済みプロバイダから AA スマートアカウントアドレスを導出する。
   * セッション未接続時は null を返す。
   */
  async resolveAaWalletAddress(): Promise<`0x${string}` | null> {
    const provider = await this.getOrRestoreProvider();
    if (!provider) return null;
    const { smartAccountAddress } = await buildKernelClient(provider);
    return smartAccountAddress as `0x${string}`;
  }

  /**
   * 認証済み Web3Auth provider を返す。
   * AA UserOperation 送信時に使用する。
   */
  getConnectedProvider(): Web3AuthProvider | null {
    return connectedProvider;
  }

  /**
   * 接続済み provider を返す。
   * メモリ上に無い場合は Web3Auth セッションからの静的復元を 1 回試みる。
   */
  async getOrRestoreProvider(): Promise<Web3AuthProvider | null> {
    if (connectedProvider) return connectedProvider;
    await this.restoreSocialSession();
    return connectedProvider;
  }
}

export const Web3AuthService = new Web3AuthServiceClass();
