import { expect } from 'chai';
import { ethers } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-toolbox/network-helpers';

describe('NodeStayComputeRight settlement', () => {
  async function deploy() {
    const [deployer, buyer, merchant, platform, other] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory('MockERC20');
    const token = await MockERC20.deploy();

    const ComputeRight = await ethers.getContractFactory('NodeStayComputeRight');
    const compute = await ComputeRight.deploy(await token.getAddress(), platform.address);
    await compute.setOperator(deployer.address);

    return { deployer, buyer, merchant, platform, other, token, compute };
  }

  it('completeJob は NFT 所有者ではなく商家ウォレットへ精算する', async () => {
    const { buyer, merchant, platform, other, token, compute } = await deploy();
    const nodeId = ethers.keccak256(ethers.toUtf8Bytes('node:compute-001'));
    const price = ethers.parseEther('80');

    await compute.mintComputeRight(
      buyer.address,
      merchant.address,
      nodeId,
      3600,
      price,
    );
    const tokenId = (await compute.nextTokenId()) - 1n;

    // 所有者が変わっても精算先が変わらないことを確認する
    await compute.connect(buyer).transferFrom(buyer.address, other.address, tokenId);

    await token.mint(await compute.getAddress(), price);
    await compute.startJob(tokenId);
    await compute.completeJob(tokenId);

    const expectedFee = price * 2500n / 10000n;
    const expectedMerchantAmount = price - expectedFee;

    expect(await token.balanceOf(merchant.address)).to.equal(expectedMerchantAmount);
    expect(await token.balanceOf(platform.address)).to.equal(expectedFee);
    expect(await token.balanceOf(other.address)).to.equal(0n);
  });

  it('interruptJob は使用分のみ商家へ、未使用分を buyer へ返金する', async () => {
    const { buyer, merchant, platform, token, compute } = await deploy();
    const nodeId = ethers.keccak256(ethers.toUtf8Bytes('node:compute-002'));
    const price = ethers.parseEther('100');
    const duration = 3600n;

    await compute.mintComputeRight(
      buyer.address,
      merchant.address,
      nodeId,
      duration,
      price,
    );
    const tokenId = (await compute.nextTokenId()) - 1n;

    await token.mint(await compute.getAddress(), price);
    await compute.startJob(tokenId);

    // 半分利用して中断
    await time.increase(1800);
    await compute.interruptJob(tokenId, buyer.address);

    const data = await compute.getComputeData(tokenId);
    const rawUsedSeconds = data.endedAt - data.startedAt;
    const usedSeconds = rawUsedSeconds > duration ? duration : rawUsedSeconds;
    const usedAmount = price * usedSeconds / duration;
    const expectedFee = usedAmount * 2500n / 10000n;
    const expectedMerchantAmount = usedAmount - expectedFee;
    const expectedRefund = price - usedAmount;

    expect(await token.balanceOf(merchant.address)).to.equal(expectedMerchantAmount);
    expect(await token.balanceOf(platform.address)).to.equal(expectedFee);
    expect(await token.balanceOf(buyer.address)).to.equal(expectedRefund);
  });
});
