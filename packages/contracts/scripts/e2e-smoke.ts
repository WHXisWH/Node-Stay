import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ethers, network } from 'hardhat';
import {
  MockERC20__factory,
  NodeStayComputeRight__factory,
  NodeStayMarketplace__factory,
  NodeStayRevenueRight__factory,
  NodeStayUsageRight__factory,
} from '../typechain-types';

type Deployment = {
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

type TxRecord = {
  stage: string;
  hash: string;
};

const GAS_FUND = ethers.parseEther('0.2');
const LISTING_PRICE = ethers.parseEther('100');
const COMPUTE_PRICE = ethers.parseEther('80');
const REVENUE_ALLOCATION = ethers.parseEther('150');

async function main() {
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  const deploymentPath = join('deployments', `${network.name}-latest.json`);
  const deployment = JSON.parse(readFileSync(deploymentPath, 'utf8')) as Deployment;
  const txs: TxRecord[] = [];

  console.log('====================================');
  console.log(`Network: ${network.name} (${net.chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Deployment file: ${deploymentPath}`);
  console.log('====================================');

  const jpyc = MockERC20__factory.connect(deployment.jpycToken, deployer);
  const usageRight = NodeStayUsageRight__factory.connect(deployment.usageRight, deployer);
  const marketplace = NodeStayMarketplace__factory.connect(deployment.marketplace, deployer);
  const computeRight = NodeStayComputeRight__factory.connect(deployment.computeRight, deployer);
  const revenueRight = NodeStayRevenueRight__factory.connect(deployment.revenueRight, deployer);

  const alice = ethers.Wallet.createRandom().connect(ethers.provider);
  const bob = ethers.Wallet.createRandom().connect(ethers.provider);

  await waitAndRecord(
    'fund-alice-gas',
    deployer.sendTransaction({ to: alice.address, value: GAS_FUND }),
    txs,
  );
  await waitAndRecord(
    'fund-bob-gas',
    deployer.sendTransaction({ to: bob.address, value: GAS_FUND }),
    txs,
  );

  await waitAndRecord('mint-jpyc-bob', jpyc.mint(bob.address, ethers.parseEther('1000')), txs);
  await waitAndRecord('mint-jpyc-deployer', jpyc.mint(deployer.address, ethers.parseEther('2000')), txs);

  // UsageRight: operator 設定と mint
  const currentOperator = await usageRight.operator();
  if (currentOperator.toLowerCase() !== deployer.address.toLowerCase()) {
    await waitAndRecord('usage-set-operator', usageRight.setOperator(deployer.address), txs);
  }

  const now = Math.floor(Date.now() / 1000);
  const machineId = ethers.keccak256(ethers.toUtf8Bytes(`machine:${Date.now()}`));
  const machinePoolId = ethers.keccak256(ethers.toUtf8Bytes('pool:smoke'));
  await waitAndRecord(
    'usage-mint',
    usageRight.mintUsageRight(
      alice.address,
      machineId,
      machinePoolId,
      now + 3600,
      now + 10800,
      0,
      true,
      now + 86400,
      3,
      0,
      'ipfs://nodestay/smoke-usage-right',
    ),
    txs,
  );
  const usageRightId = (await usageRight.nextTokenId()) - 1n;

  await waitAndRecord(
    'marketplace-approve',
    usageRight.connect(alice).approve(deployment.marketplace, usageRightId),
    txs,
  );

  const listingId = await marketplace.nextListingId();
  await waitAndRecord(
    'marketplace-list',
    marketplace.connect(alice).createListing(usageRightId, LISTING_PRICE),
    txs,
  );
  await waitAndRecord(
    'marketplace-jpyc-approve',
    jpyc.connect(bob).approve(deployment.marketplace, LISTING_PRICE),
    txs,
  );
  await waitAndRecord('marketplace-buy', marketplace.connect(bob).buyListing(listingId), txs);

  // Compute: mint -> start -> complete
  const computeNodeId = ethers.keccak256(ethers.toUtf8Bytes('node:smoke-compute'));
  await waitAndRecord(
    'compute-mint',
    computeRight.mintComputeRight(alice.address, computeNodeId, 3600, COMPUTE_PRICE),
    txs,
  );
  const computeTokenId = (await computeRight.nextTokenId()) - 1n;
  await waitAndRecord(
    'compute-fund-contract',
    jpyc.transfer(deployment.computeRight, COMPUTE_PRICE),
    txs,
  );
  await waitAndRecord('compute-start', computeRight.startJob(computeTokenId), txs);
  await waitAndRecord('compute-complete', computeRight.completeJob(computeTokenId), txs);

  // Revenue: create program -> record allocation -> claim
  const revenueNodeId = ethers.keccak256(ethers.toUtf8Bytes('node:smoke-revenue'));
  await waitAndRecord(
    'revenue-create-program',
    revenueRight.createProgram(
      revenueNodeId,
      [alice.address, bob.address],
      [70, 30],
      now,
      now + 30 * 24 * 3600,
      'MONTHLY',
    ),
    txs,
  );
  const programId = (await revenueRight.nextProgramId()) - 1n;
  await waitAndRecord(
    'revenue-jpyc-approve',
    jpyc.approve(deployment.revenueRight, REVENUE_ALLOCATION),
    txs,
  );
  await waitAndRecord(
    'revenue-record-allocation',
    revenueRight.recordAllocation(programId, REVENUE_ALLOCATION, now, now + 7 * 24 * 3600),
    txs,
  );
  const allocationId = (await revenueRight.nextAllocationId()) - 1n;
  await waitAndRecord(
    'revenue-claim-alice',
    revenueRight.connect(alice).claim(programId, allocationId),
    txs,
  );
  await waitAndRecord(
    'revenue-claim-bob',
    revenueRight.connect(bob).claim(programId, allocationId),
    txs,
  );

  const out = {
    network: network.name,
    chainId: net.chainId.toString(),
    ranAtIso: new Date().toISOString(),
    deployer: deployer.address,
    participants: {
      alice: alice.address,
      bob: bob.address,
    },
    entities: {
      usageRightId: usageRightId.toString(),
      listingId: listingId.toString(),
      computeTokenId: computeTokenId.toString(),
      revenueProgramId: programId.toString(),
      revenueAllocationId: allocationId.toString(),
    },
    txs,
  };

  const outPath = join('deployments', `${network.name}-smoke-latest.json`);
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`Smoke result file: ${outPath}`);
  console.log(JSON.stringify(out, null, 2));
}

async function waitAndRecord(stage: string, txPromise: Promise<{ hash: string; wait: () => Promise<unknown> }>, txs: TxRecord[]) {
  const tx = await txPromise;
  await tx.wait();
  txs.push({ stage, hash: tx.hash });
  console.log(`${stage}: ${tx.hash}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
