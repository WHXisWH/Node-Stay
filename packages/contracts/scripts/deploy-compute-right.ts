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

async function main() {
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  const deploymentPath = join('deployments', `${network.name}-latest.json`);

  const jpycAddress = process.env.JPYC_TOKEN_ADDRESS?.trim();
  const feeRecipient = process.env.PLATFORM_FEE_RECIPIENT?.trim() || deployer.address;
  if (!jpycAddress || !ethers.isAddress(jpycAddress)) {
    throw new Error('JPYC_TOKEN_ADDRESS が未設定または不正です');
  }
  if (!ethers.isAddress(feeRecipient)) {
    throw new Error('PLATFORM_FEE_RECIPIENT が不正です');
  }

  console.log('====================================');
  console.log(`ネットワーク: ${network.name} (${net.chainId})`);
  console.log(`デプロイヤー: ${deployer.address}`);
  console.log(`JPYC       : ${jpycAddress}`);
  console.log(`手数料受取  : ${feeRecipient}`);
  console.log('====================================');

  const ComputeRight = await ethers.getContractFactory('NodeStayComputeRight');
  const computeRight = await ComputeRight.deploy(jpycAddress, feeRecipient);
  await computeRight.waitForDeployment();
  const computeRightAddress = await computeRight.getAddress();
  console.log(`✅ NodeStayComputeRight: ${computeRightAddress}`);

  const operatorAddress = process.env.COMPUTE_OPERATOR_ADDRESS?.trim();
  if (operatorAddress) {
    if (!ethers.isAddress(operatorAddress)) {
      throw new Error('COMPUTE_OPERATOR_ADDRESS が不正です');
    }
    const normalizedOperator = ethers.getAddress(operatorAddress);
    const currentOperator = await computeRight.operator();
    if (currentOperator.toLowerCase() !== normalizedOperator.toLowerCase()) {
      const tx = await computeRight.setOperator(normalizedOperator);
      await tx.wait();
      console.log(`✅ setOperator: ${normalizedOperator} (${tx.hash})`);
    } else {
      console.log(`ℹ operator は既に設定済み: ${normalizedOperator}`);
    }
  }

  let deployment: DeploymentFile | null = null;
  try {
    deployment = JSON.parse(readFileSync(deploymentPath, 'utf8')) as DeploymentFile;
  } catch {
    deployment = null;
  }

  if (deployment) {
    deployment.computeRight = computeRightAddress;
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
