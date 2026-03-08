import { createWalletClient, custom } from 'viem';
import { CHAIN_CONFIG } from './config';

const CLIENT_ID = process.env.NEXT_PUBLIC_WEB3AUTH_CLIENT_ID ?? '';
const REQUESTED_NETWORK = process.env.NEXT_PUBLIC_WEB3AUTH_NETWORK ?? 'sapphire_devnet';

type Web3AuthSdk = typeof import('@web3auth/modal');
type Web3AuthInstance = import('@web3auth/modal').Web3Auth;
type Web3AuthProvider = import('@web3auth/modal').IProvider;
let web3AuthPromise: Promise<Web3AuthInstance> | null = null;

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

async function getWalletClient(provider: Web3AuthProvider) {
  return createWalletClient({
    transport: custom(provider as never),
  });
}

export const Web3AuthService = {
  async connectSocial(): Promise<{ address: `0x${string}`; signMessage: (message: string) => Promise<string> }> {
    const web3auth = await getWeb3Auth();
    const provider = await web3auth.connect();
    if (!provider) {
      throw new Error('ソーシャルログインがキャンセルされました。');
    }

    const walletClient = await getWalletClient(provider);
    const addresses = await walletClient.getAddresses();
    const address = addresses[0];
    if (!address) {
      throw new Error('ウォレットアドレスを取得できませんでした。');
    }

    return {
      address,
      signMessage: async (message: string) => {
        return walletClient.signMessage({ account: address, message });
      },
    };
  },

  async logout(): Promise<void> {
    if (!web3AuthPromise) return;
    const web3auth = await web3AuthPromise;
    await web3auth.logout({ cleanup: true });
  },
};
