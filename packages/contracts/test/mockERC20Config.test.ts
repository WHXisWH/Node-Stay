import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('MockERC20Config (test helper)', () => {
  it('covers happy paths and failure branches', async () => {
    const [owner, a, b, spender] = await ethers.getSigners();

    const Token = await ethers.getContractFactory('MockERC20Config');
    const token = await Token.deploy();

    // toggle flags
    await token.setTransferReturns(false);
    await token.setTransferFromReturns(false);
    expect(await token.transferReturns()).to.equal(false);
    expect(await token.transferFromReturns()).to.equal(false);
    await token.setTransferReturns(true);
    await token.setTransferFromReturns(true);

    // mint
    await token.mint(a.address, 100);
    expect(await token.totalSupply()).to.equal(100);
    expect(await token.balanceOf(a.address)).to.equal(100);

    // approve / allowance
    await token.connect(a).approve(spender.address, 50);
    expect(await token.allowance(a.address, spender.address)).to.equal(50);

    // transfer ok
    await expect(token.connect(a).transfer(b.address, 10)).to.emit(token, 'Transfer');
    expect(await token.balanceOf(b.address)).to.equal(10);

    // transfer returns false
    await token.setTransferReturns(false);
    await token.connect(a).transfer(b.address, 1);
    expect(await token.balanceOf(b.address)).to.equal(10);
    await token.setTransferReturns(true);

    // transfer revert branches
    await expect(token.connect(a).transfer(ethers.ZeroAddress, 1)).to.be.revertedWith('to=0');
    await expect(token.connect(owner).transfer(b.address, 1)).to.be.revertedWith('balance');

    // transferFrom ok
    await token.connect(a).approve(spender.address, 20);
    await expect(token.connect(spender).transferFrom(a.address, b.address, 5)).to.emit(token, 'Transfer');

    // transferFrom returns false
    await token.setTransferFromReturns(false);
    await token.connect(spender).transferFrom(a.address, b.address, 1);
    await token.setTransferFromReturns(true);

    // transferFrom revert branches
    await expect(token.connect(owner).transferFrom(a.address, b.address, 1)).to.be.revertedWith('allowance');
  });
});
