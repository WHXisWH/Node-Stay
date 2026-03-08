import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('DepositVault', () => {
  it('hold/capture/release flow', async () => {
    const [owner, operator, payer, venue] = await ethers.getSigners();

    const Token = await ethers.getContractFactory('MockERC20');
    const token = await Token.deploy();
    await token.mint(payer.address, 1_000);

    const Vault = await ethers.getContractFactory('DepositVault');
    const vault = await Vault.deploy(await token.getAddress());
    await vault.setOperator(operator.address);

    await token.connect(payer).approve(await vault.getAddress(), 500);
    await expect(vault.connect(payer).holdDeposit(0)).to.be.revertedWith('amount=0');
    await expect(vault.connect(payer).holdDeposit(300)).to.emit(vault, 'DepositHeld');

    expect(await vault.heldBalance(payer.address)).to.equal(300);

    await expect(vault.connect(owner).captureDeposit(payer.address, venue.address, 1)).to.be.revertedWithCustomError(
      vault,
      'NotOperator',
    );
    await expect(vault.connect(operator).captureDeposit(payer.address, venue.address, 200)).to.emit(vault, 'DepositCaptured');
    expect(await vault.heldBalance(payer.address)).to.equal(100);

    await expect(vault.connect(operator).releaseDeposit(payer.address, 200)).to.be.revertedWithCustomError(
      vault,
      'InsufficientHeld',
    );
    await expect(vault.connect(operator).releaseDeposit(payer.address, 100)).to.emit(vault, 'DepositReleased');
    expect(await vault.heldBalance(payer.address)).to.equal(0);
  });

  it('covers revert branches', async () => {
    const [owner, operator, payer, venue] = await ethers.getSigners();

    const Token = await ethers.getContractFactory('MockERC20Config');
    const token = await Token.deploy();
    await token.mint(payer.address, 1_000);

    const Vault = await ethers.getContractFactory('DepositVault');
    const vault = await Vault.deploy(await token.getAddress());

    await expect(vault.setOperator(ethers.ZeroAddress)).to.be.revertedWithCustomError(vault, 'ZeroAddress');
    await expect(vault.connect(payer).setOperator(operator.address)).to.be.revertedWithCustomError(
      vault,
      'OwnableUnauthorizedAccount',
    );
    await vault.setOperator(operator.address);

    // transferFrom failed
    await token.setTransferFromReturns(false);
    await token.connect(payer).approve(await vault.getAddress(), 10);
    await expect(vault.connect(payer).holdDeposit(10)).to.be.revertedWith('transferFrom failed');
    await token.setTransferFromReturns(true);

    // hold ok
    await expect(vault.connect(payer).holdDeposit(10)).to.emit(vault, 'DepositHeld');

    // InsufficientHeld on capture
    await expect(vault.connect(operator).captureDeposit(payer.address, venue.address, 999)).to.be.revertedWithCustomError(
      vault,
      'InsufficientHeld',
    );

    // NotOperator on release
    await expect(vault.connect(owner).releaseDeposit(payer.address, 1)).to.be.revertedWithCustomError(vault, 'NotOperator');

    // to=0
    await expect(vault.connect(operator).captureDeposit(payer.address, ethers.ZeroAddress, 1)).to.be.revertedWithCustomError(
      vault,
      'ZeroAddress',
    );

    // transfer failed (capture/release)
    await token.setTransferReturns(false);
    await expect(vault.connect(operator).captureDeposit(payer.address, venue.address, 1)).to.be.revertedWith('transfer failed');
    await expect(vault.connect(operator).releaseDeposit(payer.address, 1)).to.be.revertedWith('transfer failed');
  });

  it('constructor rejects zero token', async () => {
    const Vault = await ethers.getContractFactory('DepositVault');
    await expect(Vault.deploy(ethers.ZeroAddress)).to.be.revertedWithCustomError(Vault, 'ZeroAddress');
  });
});
