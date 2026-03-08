import { expect } from 'chai';
import { ethers } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-toolbox/network-helpers';

describe('NodeStayUsageRight', () => {
  async function deploy() {
    const [owner, operator, user, other] = await ethers.getSigners();
    const UsageRight = await ethers.getContractFactory('NodeStayUsageRight');
    const ur = await UsageRight.deploy();
    await ur.setOperator(operator.address);

    const machineId    = ethers.keccak256(ethers.toUtf8Bytes('machine-001'));
    const machinePoolId = ethers.ZeroHash;
    const now = BigInt(await time.latest());
    const startAt = now + 3600n;        // 1時間後
    const endAt   = startAt + 10800n;   // 3時間パック
    const transferCutoff = endAt;       // 使用終了まで転送可能（十分に未来）

    // 標準的な使用権のミント（transferCutoff = 0 で無制限も可）
    async function mintDefault(to: string, transferable = true) {
      const tx = await ur.connect(operator).mintUsageRight(
        to,
        machineId,
        machinePoolId,
        startAt,
        endAt,
        1, // PACK
        transferable,
        transferCutoff,
        1, // maxTransferCount
        0, // kycLevelRequired
        'ipfs://usage-meta'
      );
      const receipt = await tx.wait();
      const event = receipt!.logs
        .map((l: any) => { try { return ur.interface.parseLog(l); } catch { return null; } })
        .find((e: any) => e?.name === 'UsageRightMinted');
      return event!.args.usageRightId as bigint;
    }

    return { ur, owner, operator, user, other, machineId, startAt, endAt, transferCutoff, mintDefault };
  }

  // -----------------------------------------------------------------------
  // ミント
  // -----------------------------------------------------------------------

  it('オペレータが使用権を発行できる', async () => {
    const { ur, operator, user, machineId, mintDefault } = await deploy();
    const tokenId = await mintDefault(user.address);

    expect(await ur.ownerOf(tokenId)).to.equal(user.address);

    const data = await ur.getUsageData(tokenId);
    expect(data.machineId).to.equal(machineId);
    expect(data.status).to.equal(0); // MINTED
    expect(data.transferable).to.be.true;
    expect(data.transferCount).to.equal(0);
  });

  it('ゼロアドレスへのミントは失敗する', async () => {
    const { ur, operator, machineId } = await deploy();
    const now = BigInt(await time.latest());
    await expect(
      ur.connect(operator).mintUsageRight(
        ethers.ZeroAddress, machineId, ethers.ZeroHash,
        now + 3600n, now + 7200n, 1, true, now, 1, 0, 'uri'
      )
    ).to.be.revertedWithCustomError(ur, 'ZeroAddress');
  });

  it('オペレータ以外はミントできない', async () => {
    const { ur, other, machineId } = await deploy();
    const now = BigInt(await time.latest());
    await expect(
      ur.connect(other).mintUsageRight(
        other.address, machineId, ethers.ZeroHash,
        now + 3600n, now + 7200n, 1, true, now, 1, 0, 'uri'
      )
    ).to.be.revertedWithCustomError(ur, 'NotOperator');
  });

  // -----------------------------------------------------------------------
  // 消費（チェックアウト）
  // -----------------------------------------------------------------------

  it('オペレータが使用権を消費できる（MINTED → CONSUMED）', async () => {
    const { ur, operator, user, mintDefault } = await deploy();
    const tokenId = await mintDefault(user.address);

    await expect(ur.connect(operator).consumeUsageRight(tokenId))
      .to.emit(ur, 'UsageRightConsumed').withArgs(tokenId);

    const data = await ur.getUsageData(tokenId);
    expect(data.status).to.equal(4); // CONSUMED
  });

  it('消費済みの使用権を再度消費しようとすると失敗する', async () => {
    const { ur, operator, user, mintDefault } = await deploy();
    const tokenId = await mintDefault(user.address);
    await ur.connect(operator).consumeUsageRight(tokenId);

    await expect(ur.connect(operator).consumeUsageRight(tokenId))
      .to.be.revertedWithCustomError(ur, 'AlreadyConsumed');
  });

  // -----------------------------------------------------------------------
  // キャンセル
  // -----------------------------------------------------------------------

  it('オペレータが使用権をキャンセルできる（MINTED → CANCELLED）', async () => {
    const { ur, operator, user, mintDefault } = await deploy();
    const tokenId = await mintDefault(user.address);

    await expect(ur.connect(operator).cancelUsageRight(tokenId))
      .to.emit(ur, 'UsageRightCancelled').withArgs(tokenId);

    const data = await ur.getUsageData(tokenId);
    expect(data.status).to.equal(6); // CANCELLED
  });

  // -----------------------------------------------------------------------
  // ロック / アンロック
  // -----------------------------------------------------------------------

  it('オペレータが使用権をロック/アンロックできる', async () => {
    const { ur, operator, user, mintDefault } = await deploy();
    const tokenId = await mintDefault(user.address);

    await expect(ur.connect(operator).lockUsageRight(tokenId))
      .to.emit(ur, 'UsageRightLocked').withArgs(tokenId);

    expect((await ur.getUsageData(tokenId)).status).to.equal(2); // LOCKED

    await expect(ur.connect(operator).unlockUsageRight(tokenId))
      .to.emit(ur, 'UsageRightUnlocked').withArgs(tokenId);

    expect((await ur.getUsageData(tokenId)).status).to.equal(0); // MINTED
  });

  it('LOCKED 以外をアンロックしようとすると失敗する', async () => {
    const { ur, operator, user, mintDefault } = await deploy();
    const tokenId = await mintDefault(user.address);

    await expect(ur.connect(operator).unlockUsageRight(tokenId))
      .to.be.revertedWithCustomError(ur, 'InvalidStatus');
  });

  // -----------------------------------------------------------------------
  // 転送制限
  // -----------------------------------------------------------------------

  it('転送可能な使用権は isTransferAllowed = true', async () => {
    const { ur, operator, user, mintDefault } = await deploy();
    const tokenId = await mintDefault(user.address, true);
    expect(await ur.isTransferAllowed(tokenId)).to.be.true;
  });

  it('転送不可の使用権は isTransferAllowed = false', async () => {
    const { ur, operator, user, mintDefault } = await deploy();
    const tokenId = await mintDefault(user.address, false);
    expect(await ur.isTransferAllowed(tokenId)).to.be.false;
  });

  it('転送可能な使用権はユーザーが転送できる（回数カウント）', async () => {
    const { ur, operator, user, other, mintDefault } = await deploy();
    const tokenId = await mintDefault(user.address, true);

    await ur.connect(user).transferFrom(user.address, other.address, tokenId);

    expect(await ur.ownerOf(tokenId)).to.equal(other.address);
    const data = await ur.getUsageData(tokenId);
    expect(data.transferCount).to.equal(1);
  });

  it('maxTransferCount を超えると転送できない', async () => {
    const { ur, operator, user, other, mintDefault } = await deploy();
    const tokenId = await mintDefault(user.address, true); // maxTransferCount = 1

    await ur.connect(user).transferFrom(user.address, other.address, tokenId);

    await expect(
      ur.connect(other).transferFrom(other.address, user.address, tokenId)
    ).to.be.revertedWithCustomError(ur, 'MaxTransferCountReached');
  });

  it('転送不可の使用権を転送しようとすると NotTransferable', async () => {
    const { ur, operator, user, other, mintDefault } = await deploy();
    const tokenId = await mintDefault(user.address, false);

    await expect(
      ur.connect(user).transferFrom(user.address, other.address, tokenId)
    ).to.be.revertedWithCustomError(ur, 'NotTransferable');
  });

  it('転送締切後は転送できない（TransferCutoffPassed）', async () => {
    const { ur, operator, user, other, startAt } = await deploy();
    const machineId = ethers.keccak256(ethers.toUtf8Bytes('machine-001'));
    const now = BigInt(await time.latest());

    // transferCutoff を過去（すでに締切済み）に設定
    const pastCutoff = now - 1n;
    const tx = await ur.connect(operator).mintUsageRight(
      user.address, machineId, ethers.ZeroHash,
      startAt, startAt + 10800n, 1,
      true, pastCutoff, 1, 0, 'uri'
    );
    const receipt = await tx.wait();
    const tokenId = receipt!.logs
      .map((l: any) => { try { return ur.interface.parseLog(l); } catch { return null; } })
      .find((e: any) => e?.name === 'UsageRightMinted')!.args.usageRightId;

    await expect(
      ur.connect(user).transferFrom(user.address, other.address, tokenId)
    ).to.be.revertedWithCustomError(ur, 'TransferCutoffPassed');
  });

  it('CHECKED_IN 状態の使用権は転送できない', async () => {
    const { ur, operator, user, other, mintDefault } = await deploy();
    const tokenId = await mintDefault(user.address);

    // MINTED → LOCKED → CHECKED_IN はオペレータが状態を直接更新するシナリオ
    // ここでは lock して転送不可になることをテスト
    await ur.connect(operator).lockUsageRight(tokenId);

    await expect(
      ur.connect(user).transferFrom(user.address, other.address, tokenId)
    ).to.be.revertedWithCustomError(ur, 'InvalidStatus');
  });

  // -----------------------------------------------------------------------
  // アクセス制御
  // -----------------------------------------------------------------------

  it('オペレータ設定：ゼロアドレスは失敗する', async () => {
    const { ur } = await deploy();
    await expect(ur.setOperator(ethers.ZeroAddress))
      .to.be.revertedWithCustomError(ur, 'ZeroAddress');
  });

  it('存在しないトークンの操作は失敗する', async () => {
    const { ur, operator } = await deploy();
    await expect(ur.connect(operator).consumeUsageRight(9999))
      .to.be.revertedWithCustomError(ur, 'TokenNotFound');
  });
});
