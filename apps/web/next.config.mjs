/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {},
  webpack: (config) => {
    config.resolve = config.resolve ?? {};
    config.resolve.alias = config.resolve.alias ?? {};
    // MetaMask SDK が参照する React Native storage を web build から除外する
    config.resolve.alias['@react-native-async-storage/async-storage'] = false;
    // WalletConnect logger の optional dependency（開発時ノイズ抑制）
    config.resolve.alias['pino-pretty'] = false;
    return config;
  },
};

export default nextConfig;
