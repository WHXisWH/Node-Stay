import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ethers, network } from 'hardhat';

type DeploymentFile = {
  network: string;
  chainId: string;
  deployedAtIso: string;
  deployer: string;
  jpycToken: string;
  machineRegistry: string;
  usageRight: string;
  settlement: string;
  marketplace: string;
  computeRight: string;
  revenueRight: string;
  platformFeeRecipient: string;
  platformTreasury: string;
};

function requireAddress(name: string, value?: string) {
  const raw = value?.trim();
  if (!raw || !ethers.isAddress(raw)) {
    throw new Error(`${name} が未設定または不正です`);
  }
  return ethers.getAddress(raw);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  const deploymentPath = join('deployments', `${network.name}-latest.json`);

  const jpyc = requireAddress('JPYC_TOKEN_ADDRESS', process.env.JPYC_TOKEN_ADDRESS);
  const usageRight = requireAddress('USAGE_RIGHT_ADDRESS', process.env.USAGE_RIGHT_ADDRESS);
  const platformFeeRecipient = requireAddress('PLATFORM_FEE_RECIPIENT', process.env.PLATFORM_FEE_RECIPIENT);
  const platformTreasury = requireAddress('PLATFORM_TREASURY', process.env.PLATFORM_TREASURY);
  const operator = requireAddress('STACK_OPERATOR_ADDRESS', process.env.STACK_OPERATOR_ADDRESS);

  console.log('====================================');
  console.log(`ネットワーク: ${network.name} (${net.chainId})`);
  console.log(`デプロイヤー: ${deployer.address}`);
  console.log(`JPYC       : ${jpyc}`);
  console.log(`UsageRight : ${usageRight}`);
  console.log(`operator   : ${operator}`);
  console.log('====================================');

  const Settlement = await ethers.getContractFactory('NodeStaySettlement');
  const settlement = await Settlement.deploy(jpyc, platformTreasury);
  await settlement.waitForDeployment();
  const settlementAddress = await settlement.getAddress();
  await (await settlement.setOperator(operator)).wait();
  console.log(`✅ Settlement: ${settlementAddress}`);

  const Marketplace = await ethers.getContractFactory('NodeStayMarketplace');
  const marketplace = await Marketplace.deploy(jpyc, usageRight, platformFeeRecipient);
  await marketplace.waitForDeployment();
  const marketplaceAddress = await marketplace.getAddress();
  console.log(`✅ Marketplace: ${marketplaceAddress}`);

  const RevenueRight = await ethers.getContractFactory('NodeStayRevenueRight');
  const revenueRight = await RevenueRight.deploy(jpyc);
  await revenueRight.waitForDeployment();
  const revenueRightAddress = await revenueRight.getAddress();
  await (await revenueRight.setOperator(operator)).wait();
  console.log(`✅ RevenueRight: ${revenueRightAddress}`);

  let deployment: DeploymentFile | null = null;
  try {
    deployment = JSON.parse(readFileSync(deploymentPath, 'utf8')) as DeploymentFile;
  } catch {
    deployment = null;
  }

  if (deployment) {
    deployment.jpycToken = jpyc;
    deployment.settlement = settlementAddress;
    deployment.marketplace = marketplaceAddress;
    deployment.revenueRight = revenueRightAddress;
    deployment.platformFeeRecipient = platformFeeRecipient;
    deployment.platformTreasury = platformTreasury;
    deployment.deployedAtIso = new Date().toISOString();
    deployment.deployer = deployer.address;
    writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
    console.log(`📝 更新: ${deploymentPath}`);
  } else {
    console.log(`⚠ deployment file が見つからないため更新をスキップ: ${deploymentPath}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
