import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import * as dotenv from 'dotenv';

dotenv.config();

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY ?? '';

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.26',
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'cancun',
    },
  },
  networks: {
    // Polygon Amoy テストネット
    amoy: {
      url: process.env.AMOY_RPC_URL ?? 'https://rpc-amoy.polygon.technology',
      chainId: 80002,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
    // Polygon PoS メインネット
    polygon: {
      url: process.env.POLYGON_RPC_URL ?? 'https://polygon-rpc.com',
      chainId: 137,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    // Etherscan API V2 は chain 別 key ではなく単一 key を利用する
    apiKey: process.env.ETHERSCAN_API_KEY ?? process.env.POLYGONSCAN_API_KEY ?? '',
  },
  paths: {
    sources: './contracts',
    tests: './test',
    cache: './cache',
    artifacts: './artifacts',
  },
};

export default config;
