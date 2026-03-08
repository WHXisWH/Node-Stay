/**
 * NodeStay 新コントラクト群デプロイスクリプト
 *
 * Amoy テストネット:
 *   npx hardhat run scripts/deploy.ts --network amoy
 *
 * Polygon メインネット:
 *   npx hardhat run scripts/deploy.ts --network polygon
 *
 * ローカル:
 *   npx hardhat run scripts/deploy.ts
 */

import { ethers, network, run } from 'hardhat';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// 検証まで待機するブロック数
const VERIFY_WAIT_BLOCKS = 5;

// ネットワーク別の JPYC トークンアドレス
const JPYC_ADDRESSES: Record<string, string> = {
  polygon: '0x431D5dfF03120AFA4bDf332c61A6e1766eF37BF6', // Polygon PoS JPYC v2
  amoy: '', // テストネットは未指定時 MockERC20 をデプロイ
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const networkName = network.name;

  console.log('====================================');
  console.log(`ネットワーク  : ${networkName} (chainId: ${chainId})`);
  console.log(`デプロイヤー  : ${deployer.address}`);
  console.log(`残高          : ${ethers.formatEther(await ethers.provider.getBalance(deployer.address))} MATIC`);
  console.log('====================================\n');

  const platformFeeRecipient = process.env.PLATFORM_FEE_RECIPIENT || deployer.address;
  const platformTreasury = process.env.PLATFORM_TREASURY || platformFeeRecipient;

  // -----------------------------------------------------------------------
  // 1. JPYC トークンアドレスの決定
  // -----------------------------------------------------------------------

  let jpycAddress = process.env.JPYC_TOKEN_ADDRESS || JPYC_ADDRESSES[networkName] || '';

  if (!jpycAddress) {
    console.log('⚠  JPYC アドレス未設定。MockERC20 をデプロイします...');
    const MockERC20 = await ethers.getContractFactory('MockERC20');
    const mock = await MockERC20.deploy();
    await mock.waitForDeployment();
    jpycAddress = await mock.getAddress();
    console.log(`✅ MockERC20: ${jpycAddress}\n`);
  } else {
    console.log(`ℹ  JPYC アドレス: ${jpycAddress}\n`);
  }

  // -----------------------------------------------------------------------
  // 2. NodeStayMachineRegistry
  // -----------------------------------------------------------------------

  console.log('📦 NodeStayMachineRegistry をデプロイ中...');
  const NodeStayMachineRegistry = await ethers.getContractFactory('NodeStayMachineRegistry');
  const machineRegistry = await NodeStayMachineRegistry.deploy();
  await machineRegistry.waitForDeployment();
  const machineRegistryAddress = await machineRegistry.getAddress();
  console.log(`✅ NodeStayMachineRegistry: ${machineRegistryAddress}`);

  // -----------------------------------------------------------------------
  // 3. NodeStayUsageRight
  // -----------------------------------------------------------------------

  console.log('\n📦 NodeStayUsageRight をデプロイ中...');
  const NodeStayUsageRight = await ethers.getContractFactory('NodeStayUsageRight');
  const usageRight = await NodeStayUsageRight.deploy();
  await usageRight.waitForDeployment();
  const usageRightAddress = await usageRight.getAddress();
  console.log(`✅ NodeStayUsageRight: ${usageRightAddress}`);

  // -----------------------------------------------------------------------
  // 4. NodeStaySettlement
  // -----------------------------------------------------------------------

  console.log('\n📦 NodeStaySettlement をデプロイ中...');
  const NodeStaySettlement = await ethers.getContractFactory('NodeStaySettlement');
  const settlement = await NodeStaySettlement.deploy(jpycAddress, platformTreasury);
  await settlement.waitForDeployment();
  const settlementAddress = await settlement.getAddress();
  console.log(`✅ NodeStaySettlement: ${settlementAddress}`);

  // -----------------------------------------------------------------------
  // 5. NodeStayMarketplace
  // -----------------------------------------------------------------------

  console.log('\n📦 NodeStayMarketplace をデプロイ中...');
  const NodeStayMarketplace = await ethers.getContractFactory('NodeStayMarketplace');
  const marketplace = await NodeStayMarketplace.deploy(
    jpycAddress,
    usageRightAddress,
    platformFeeRecipient,
  );
  await marketplace.waitForDeployment();
  const marketplaceAddress = await marketplace.getAddress();
  console.log(`✅ NodeStayMarketplace: ${marketplaceAddress}`);

  // -----------------------------------------------------------------------
  // 6. NodeStayComputeRight
  // -----------------------------------------------------------------------

  console.log('\n📦 NodeStayComputeRight をデプロイ中...');
  const NodeStayComputeRight = await ethers.getContractFactory('NodeStayComputeRight');
  const computeRight = await NodeStayComputeRight.deploy(jpycAddress, platformFeeRecipient);
  await computeRight.waitForDeployment();
  const computeRightAddress = await computeRight.getAddress();
  console.log(`✅ NodeStayComputeRight: ${computeRightAddress}`);

  // -----------------------------------------------------------------------
  // 7. NodeStayRevenueRight
  // -----------------------------------------------------------------------

  console.log('\n📦 NodeStayRevenueRight をデプロイ中...');
  const NodeStayRevenueRight = await ethers.getContractFactory('NodeStayRevenueRight');
  const revenueRight = await NodeStayRevenueRight.deploy(jpycAddress);
  await revenueRight.waitForDeployment();
  const revenueRightAddress = await revenueRight.getAddress();
  console.log(`✅ NodeStayRevenueRight: ${revenueRightAddress}`);

  // -----------------------------------------------------------------------
  // 8. デプロイ結果サマリー
  // -----------------------------------------------------------------------

  console.log('\n====================================');
  console.log('デプロイ完了 🎉');
  console.log('====================================');
  console.log(`ネットワーク           : ${networkName}`);
  console.log(`JPYC トークン          : ${jpycAddress}`);
  console.log(`NodeStayMachineRegistry: ${machineRegistryAddress}`);
  console.log(`NodeStayUsageRight     : ${usageRightAddress}`);
  console.log(`NodeStaySettlement     : ${settlementAddress}`);
  console.log(`NodeStayMarketplace    : ${marketplaceAddress}`);
  console.log(`NodeStayComputeRight   : ${computeRightAddress}`);
  console.log(`NodeStayRevenueRight   : ${revenueRightAddress}`);
  console.log(`platformFeeRecipient   : ${platformFeeRecipient}`);
  console.log(`platformTreasury       : ${platformTreasury}`);
  console.log('====================================\n');

  const deployment = {
    network: networkName,
    chainId: chainId.toString(),
    deployedAtIso: new Date().toISOString(),
    deployer: deployer.address,
    jpycToken: jpycAddress,
    machineRegistry: machineRegistryAddress,
    usageRight: usageRightAddress,
    settlement: settlementAddress,
    marketplace: marketplaceAddress,
    computeRight: computeRightAddress,
    revenueRight: revenueRightAddress,
    platformFeeRecipient,
    platformTreasury,
  };

  // デプロイ情報をローカルファイルへ出力する
  mkdirSync('deployments', { recursive: true });
  const outPath = join('deployments', `${networkName}-latest.json`);
  writeFileSync(outPath, JSON.stringify(deployment, null, 2));
  console.log(`📝 deployment file: ${outPath}`);

  // -----------------------------------------------------------------------
  // 9. Polygonscan 検証（Amoy / Polygon のみ）
  // -----------------------------------------------------------------------

  if (networkName === 'amoy' || networkName === 'polygon') {
    const apiKey = process.env.POLYGONSCAN_API_KEY;
    if (!apiKey) {
      console.log('⚠  POLYGONSCAN_API_KEY が未設定のため、検証をスキップします。');
      return;
    }

    console.log(`\n🔍 Polygonscan でコントラクトを検証中（${VERIFY_WAIT_BLOCKS} ブロック待機）...`);

    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    await sleep(VERIFY_WAIT_BLOCKS * 2000);

    const verify = async (address: string, constructorArgs: unknown[]) => {
      try {
        await run('verify:verify', {
          address,
          constructorArguments: constructorArgs,
        });
        console.log(`  ✅ 検証完了: ${address}`);
      } catch (e: unknown) {
        if (e instanceof Error && e.message.includes('Already Verified')) {
          console.log(`  ℹ  既に検証済み: ${address}`);
        } else {
          console.error(`  ❌ 検証失敗: ${address}`, e);
        }
      }
    };

    await verify(machineRegistryAddress, []);
    await verify(usageRightAddress, []);
    await verify(settlementAddress, [jpycAddress, platformTreasury]);
    await verify(marketplaceAddress, [jpycAddress, usageRightAddress, platformFeeRecipient]);
    await verify(computeRightAddress, [jpycAddress, platformFeeRecipient]);
    await verify(revenueRightAddress, [jpycAddress]);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
