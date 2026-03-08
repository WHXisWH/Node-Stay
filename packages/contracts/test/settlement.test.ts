import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('NodeStaySettlement', () => {
  async function deploy() {
    const [owner, operator, payer, venue, platform, other] = await ethers.getSigners();

    const Token = await ethers.getContractFactory('MockERC20');
    const token = await Token.deploy();

    const Settlement = await ethers.getContractFactory('NodeStaySettlement');
    const settlement = await Settlement.deploy(
      await token.getAddress(),
      platform.address
    );
    await settlement.setOperator(operator.address);

    const REF_ID = ethers.keccak256(ethers.toUtf8Bytes('session-001'));

    return { settlement, token, owner, operator, payer, venue, platform, other, REF_ID };
  }

  // -----------------------------------------------------------------------
  // コンストラクタ
  // -----------------------------------------------------------------------

  it('ゼロアドレスのトークンでデプロイは失敗する', async () => {
    const [, , , , platform] = await ethers.getSigners();
    const Settlement = await ethers.getContractFactory('NodeStaySettlement');
    await expect(
      Settlement.deploy(ethers.ZeroAddress, platform.address)
    ).to.be.revertedWithCustomError(Settlement, 'ZeroAddress');
  });

  it('ゼロアドレスのプラットフォームTreasuryでデプロイは失敗する', async () => {
    const Token = await ethers.getContractFactory('MockERC20');
    const token = await Token.deploy();
    const Settlement = await ethers.getContractFactory('NodeStaySettlement');
    await expect(
      Settlement.deploy(await token.getAddress(), ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(Settlement, 'ZeroAddress');
  });

  // -----------------------------------------------------------------------
  // デポジット凍結（holdDeposit）
  // -----------------------------------------------------------------------

  it('オペレータが payer のデポジットを凍結できる', async () => {
    const { settlement, token, operator, payer, REF_ID } = await deploy();

    await token.mint(payer.address, 1000n);
    await token.connect(payer).approve(await settlement.getAddress(), 500n);

    await expect(
      settlement.connect(operator).holdDeposit(REF_ID, payer.address, 300n)
    ).to.emit(settlement, 'DepositHeld').withArgs(REF_ID, payer.address, 300n);

    expect(await settlement.heldAmount(REF_ID)).to.equal(300n);
    expect(await settlement.depositPayer(REF_ID)).to.equal(payer.address);
  });

  it('同一 referenceId への二重凍結は失敗する（AlreadyHeld）', async () => {
    const { settlement, token, operator, payer, REF_ID } = await deploy();
    await token.mint(payer.address, 1000n);
    await token.connect(payer).approve(await settlement.getAddress(), 1000n);

    await settlement.connect(operator).holdDeposit(REF_ID, payer.address, 200n);

    await expect(
      settlement.connect(operator).holdDeposit(REF_ID, payer.address, 100n)
    ).to.be.revertedWithCustomError(settlement, 'AlreadyHeld');
  });

  it('オペレータ以外は holdDeposit できない', async () => {
    const { settlement, other, payer, REF_ID } = await deploy();
    await expect(
      settlement.connect(other).holdDeposit(REF_ID, payer.address, 100n)
    ).to.be.revertedWithCustomError(settlement, 'NotOperator');
  });

  it('ゼロアドレスの payer は失敗する', async () => {
    const { settlement, operator, REF_ID } = await deploy();
    await expect(
      settlement.connect(operator).holdDeposit(REF_ID, ethers.ZeroAddress, 100n)
    ).to.be.revertedWithCustomError(settlement, 'ZeroAddress');
  });

  // -----------------------------------------------------------------------
  // デポジット捕捉（captureDeposit）
  // -----------------------------------------------------------------------

  it('オペレータがデポジットを捕捉できる（プラットフォームへ送金）', async () => {
    const { settlement, token, operator, payer, platform, REF_ID } = await deploy();

    await token.mint(payer.address, 1000n);
    await token.connect(payer).approve(await settlement.getAddress(), 500n);
    await settlement.connect(operator).holdDeposit(REF_ID, payer.address, 300n);

    const platformBefore = await token.balanceOf(platform.address);

    await expect(
      settlement.connect(operator).captureDeposit(REF_ID, 200n)
    ).to.emit(settlement, 'DepositCaptured').withArgs(REF_ID, 200n);

    expect(await settlement.heldAmount(REF_ID)).to.equal(100n);
    expect(await token.balanceOf(platform.address)).to.equal(platformBefore + 200n);
  });

  it('保有額を超えた捕捉は失敗する（InsufficientHeld）', async () => {
    const { settlement, token, operator, payer, REF_ID } = await deploy();
    await token.mint(payer.address, 500n);
    await token.connect(payer).approve(await settlement.getAddress(), 500n);
    await settlement.connect(operator).holdDeposit(REF_ID, payer.address, 100n);

    await expect(
      settlement.connect(operator).captureDeposit(REF_ID, 200n)
    ).to.be.revertedWithCustomError(settlement, 'InsufficientHeld');
  });

  // -----------------------------------------------------------------------
  // デポジット解放（releaseDeposit）
  // -----------------------------------------------------------------------

  it('オペレータがデポジットを解放できる（payer へ返金）', async () => {
    const { settlement, token, operator, payer, REF_ID } = await deploy();

    await token.mint(payer.address, 500n);
    await token.connect(payer).approve(await settlement.getAddress(), 300n);
    await settlement.connect(operator).holdDeposit(REF_ID, payer.address, 300n);

    const payerBefore = await token.balanceOf(payer.address);

    await expect(
      settlement.connect(operator).releaseDeposit(REF_ID, 300n)
    ).to.emit(settlement, 'DepositReleased').withArgs(REF_ID, 300n);

    expect(await token.balanceOf(payer.address)).to.equal(payerBefore + 300n);
    expect(await settlement.heldAmount(REF_ID)).to.equal(0n);
  });

  it('保有額を超えた解放は失敗する（InsufficientHeld）', async () => {
    const { settlement, token, operator, payer, REF_ID } = await deploy();
    await token.mint(payer.address, 500n);
    await token.connect(payer).approve(await settlement.getAddress(), 100n);
    await settlement.connect(operator).holdDeposit(REF_ID, payer.address, 100n);

    await expect(
      settlement.connect(operator).releaseDeposit(REF_ID, 200n)
    ).to.be.revertedWithCustomError(settlement, 'InsufficientHeld');
  });

  // -----------------------------------------------------------------------
  // Usage 結算（settleUsage）：三方分配
  // -----------------------------------------------------------------------

  it('settleUsage が正しく三方分配する', async () => {
    const { settlement, token, operator, payer, venue, platform } = await deploy();

    const gross = 1000n;
    const platformFeeBps = 500;   // 5%
    const revenueFeeBps  = 0;     // 0%（収益権なし）

    await token.mint(payer.address, gross);
    await token.connect(payer).approve(await settlement.getAddress(), gross);

    const sessionId = ethers.keccak256(ethers.toUtf8Bytes('session-settle-001'));
    const machineId = ethers.keccak256(ethers.toUtf8Bytes('machine-001'));

    const venueBefore    = await token.balanceOf(venue.address);
    const platformBefore = await token.balanceOf(platform.address);

    await expect(
      settlement.connect(operator).settleUsage(
        sessionId, machineId,
        payer.address, venue.address,
        gross, platformFeeBps, revenueFeeBps
      )
    ).to.emit(settlement, 'UsageSettled');

    const venueShare    = 950n;  // 1000 - 50 (platform 5%)
    const platformShare = 50n;   // 1000 * 5% = 50
    const revenueShare  = 0n;

    expect(await token.balanceOf(venue.address)).to.equal(venueBefore + venueShare);
    expect(await token.balanceOf(platform.address)).to.equal(platformBefore + platformShare);

    // revenueShare はコントラクトに留保
    const contractBalance = await token.balanceOf(await settlement.getAddress());
    expect(contractBalance).to.equal(revenueShare);
  });

  it('settleUsage：三方分配の数値検証（venue 75%, platform 25%, revenue 0%）', async () => {
    const { settlement, token, operator, payer, venue, platform } = await deploy();

    const gross = 10000n;
    const platformFeeBps = 2500; // 25%
    const revenueFeeBps  = 0;

    await token.mint(payer.address, gross);
    await token.connect(payer).approve(await settlement.getAddress(), gross);

    const sessionId = ethers.keccak256(ethers.toUtf8Bytes('session-settle-002'));
    const machineId = ethers.keccak256(ethers.toUtf8Bytes('machine-001'));

    const venueBefore    = await token.balanceOf(venue.address);
    const platformBefore = await token.balanceOf(platform.address);

    await settlement.connect(operator).settleUsage(
      sessionId, machineId,
      payer.address, venue.address,
      gross, platformFeeBps, revenueFeeBps
    );

    expect(await token.balanceOf(venue.address)).to.equal(venueBefore + 7500n);
    expect(await token.balanceOf(platform.address)).to.equal(platformBefore + 2500n);
  });

  it('fee の合計が 100% を超えると失敗する（InvalidFeeParams）', async () => {
    const { settlement, token, operator, payer, venue } = await deploy();
    const gross = 1000n;
    await token.mint(payer.address, gross);
    await token.connect(payer).approve(await settlement.getAddress(), gross);

    const sessionId = ethers.keccak256(ethers.toUtf8Bytes('s-fail'));
    const machineId = ethers.keccak256(ethers.toUtf8Bytes('m-001'));

    await expect(
      settlement.connect(operator).settleUsage(
        sessionId, machineId,
        payer.address, venue.address,
        gross, 6000, 5000 // 60% + 50% > 100%
      )
    ).to.be.revertedWithCustomError(settlement, 'InvalidFeeParams');
  });

  it('ゼロアドレスの venueTreasury は失敗する', async () => {
    const { settlement, token, operator, payer } = await deploy();
    const gross = 1000n;
    await token.mint(payer.address, gross);
    await token.connect(payer).approve(await settlement.getAddress(), gross);

    const sessionId = ethers.keccak256(ethers.toUtf8Bytes('s-zero'));
    const machineId = ethers.keccak256(ethers.toUtf8Bytes('m-001'));

    await expect(
      settlement.connect(operator).settleUsage(
        sessionId, machineId,
        payer.address, ethers.ZeroAddress,
        gross, 500, 0
      )
    ).to.be.revertedWithCustomError(settlement, 'ZeroAddress');
  });

  it('オペレータ以外は settleUsage できない', async () => {
    const { settlement, other, payer, venue } = await deploy();
    await expect(
      settlement.connect(other).settleUsage(
        ethers.ZeroHash, ethers.ZeroHash,
        payer.address, venue.address,
        100n, 500, 0
      )
    ).to.be.revertedWithCustomError(settlement, 'NotOperator');
  });

  // -----------------------------------------------------------------------
  // アクセス制御
  // -----------------------------------------------------------------------

  it('オペレータ設定：Owner 以外は失敗する', async () => {
    const { settlement, other } = await deploy();
    await expect(settlement.connect(other).setOperator(other.address))
      .to.be.revertedWithCustomError(settlement, 'OwnableUnauthorizedAccount');
  });

  it('paymentToken() が正しいアドレスを返す', async () => {
    const { settlement, token } = await deploy();
    expect(await settlement.paymentToken()).to.equal(await token.getAddress());
  });
});
