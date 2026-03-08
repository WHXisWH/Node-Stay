import { expect } from 'chai';
import { ethers } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-toolbox/network-helpers';

// テスト用のデフォルトパラメータ
const PLAN_ID   = 1n;
const VENUE_ID  = 42n;
const DURATION  = 120n; // 120分
const ONE_HOUR  = 3600n;
const ONE_DAY   = 86400n;

describe('AccessPassNFT', () => {
  // -----------------------------------------------------------------------
  // セットアップヘルパー
  // -----------------------------------------------------------------------

  async function deploy() {
    const [owner, operator, user, other] = await ethers.getSigners();
    const AccessPass = await ethers.getContractFactory('AccessPassNFT');
    const nft = await AccessPass.deploy('NodeStay Pass', 'NSP');
    await nft.setOperator(operator.address);
    return { nft, owner, operator, user, other };
  }

  // 有効期限: 現在 + 7日
  async function futureExpiry() {
    const now = BigInt(await time.latest());
    return now + ONE_DAY * 7n;
  }

  // -----------------------------------------------------------------------
  // オペレータ設定
  // -----------------------------------------------------------------------

  describe('setOperator', () => {
    it('オーナーがオペレータを設定できる', async () => {
      const { nft, owner, operator } = await deploy();
      await expect(nft.connect(owner).setOperator(operator.address))
        .to.emit(nft, 'OperatorUpdated')
        .withArgs(operator.address);
    });

    it('ゼロアドレスを拒否する', async () => {
      const { nft, owner } = await deploy();
      await expect(nft.connect(owner).setOperator(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(nft, 'ZeroAddress');
    });

    it('オーナー以外を拒否する', async () => {
      const { nft, other } = await deploy();
      await expect(nft.connect(other).setOperator(other.address))
        .to.be.revertedWithCustomError(nft, 'OwnableUnauthorizedAccount');
    });
  });

  // -----------------------------------------------------------------------
  // mint
  // -----------------------------------------------------------------------

  describe('mint', () => {
    it('オペレータがパスをミントできる', async () => {
      const { nft, operator, user } = await deploy();
      const expiresAt = await futureExpiry();

      await expect(
        nft.connect(operator).mint(user.address, PLAN_ID, VENUE_ID, DURATION, expiresAt, true),
      )
        .to.emit(nft, 'PassMinted')
        .withArgs(1n, user.address, PLAN_ID, VENUE_ID, DURATION, expiresAt, true);

      expect(await nft.ownerOf(1n)).to.equal(user.address);
      expect(await nft.nextTokenId()).to.equal(2n);
    });

    it('PassData が正しく記録される', async () => {
      const { nft, operator, user } = await deploy();
      const expiresAt = await futureExpiry();
      await nft.connect(operator).mint(user.address, PLAN_ID, VENUE_ID, DURATION, expiresAt, false);

      const pass = await nft.passes(1n);
      expect(pass.planId).to.equal(PLAN_ID);
      expect(pass.venueId).to.equal(VENUE_ID);
      expect(pass.remainingMinutes).to.equal(DURATION);
      expect(pass.expiresAt).to.equal(expiresAt);
      expect(pass.isActive).to.equal(true);
      expect(pass.transferable).to.equal(false);
    });

    it('オペレータ以外を拒否する', async () => {
      const { nft, user } = await deploy();
      const expiresAt = await futureExpiry();
      await expect(
        nft.connect(user).mint(user.address, PLAN_ID, VENUE_ID, DURATION, expiresAt, true),
      ).to.be.revertedWithCustomError(nft, 'NotOperator');
    });

    it('ゼロアドレスへのミントを拒否する', async () => {
      const { nft, operator } = await deploy();
      const expiresAt = await futureExpiry();
      await expect(
        nft.connect(operator).mint(ethers.ZeroAddress, PLAN_ID, VENUE_ID, DURATION, expiresAt, true),
      ).to.be.revertedWithCustomError(nft, 'ZeroAddress');
    });

    it('durationMinutes=0 を拒否する', async () => {
      const { nft, operator, user } = await deploy();
      const expiresAt = await futureExpiry();
      await expect(
        nft.connect(operator).mint(user.address, PLAN_ID, VENUE_ID, 0n, expiresAt, true),
      ).to.be.revertedWithCustomError(nft, 'InvalidDuration');
    });

    it('過去の expiresAt を拒否する', async () => {
      const { nft, operator, user } = await deploy();
      const pastExpiry = BigInt(await time.latest()) - 1n;
      await expect(
        nft.connect(operator).mint(user.address, PLAN_ID, VENUE_ID, DURATION, pastExpiry, true),
      ).to.be.revertedWithCustomError(nft, 'PassExpired');
    });
  });

  // -----------------------------------------------------------------------
  // consumePass
  // -----------------------------------------------------------------------

  describe('consumePass', () => {
    it('利用時間を消費できる', async () => {
      const { nft, operator, user } = await deploy();
      const expiresAt = await futureExpiry();
      await nft.connect(operator).mint(user.address, PLAN_ID, VENUE_ID, DURATION, expiresAt, true);

      const used = 60n;
      await expect(nft.connect(operator).consumePass(1n, used))
        .to.emit(nft, 'PassConsumed')
        .withArgs(1n, used, DURATION - used);

      const pass = await nft.passes(1n);
      expect(pass.remainingMinutes).to.equal(DURATION - used);
    });

    it('残り0分になると isActive=false になる', async () => {
      const { nft, operator, user } = await deploy();
      const expiresAt = await futureExpiry();
      await nft.connect(operator).mint(user.address, PLAN_ID, VENUE_ID, 60n, expiresAt, true);

      await nft.connect(operator).consumePass(1n, 60n);
      const pass = await nft.passes(1n);
      expect(pass.isActive).to.equal(false);
    });

    it('残り分数を超える消費を拒否する', async () => {
      const { nft, operator, user } = await deploy();
      const expiresAt = await futureExpiry();
      await nft.connect(operator).mint(user.address, PLAN_ID, VENUE_ID, DURATION, expiresAt, true);

      await expect(nft.connect(operator).consumePass(1n, DURATION + 1n))
        .to.be.revertedWithCustomError(nft, 'InsufficientRemainingMinutes');
    });

    it('無効なパスの消費を拒否する', async () => {
      const { nft, operator, user } = await deploy();
      const expiresAt = await futureExpiry();
      await nft.connect(operator).mint(user.address, PLAN_ID, VENUE_ID, DURATION, expiresAt, true);
      await nft.connect(operator).suspendPass(1n);

      await expect(nft.connect(operator).consumePass(1n, 10n))
        .to.be.revertedWithCustomError(nft, 'PassInactive');
    });

    it('期限切れパスの消費を拒否する', async () => {
      const { nft, operator, user } = await deploy();
      // 直近1時間のみ有効なパスを発行
      const shortExpiry = BigInt(await time.latest()) + ONE_HOUR;
      await nft.connect(operator).mint(user.address, PLAN_ID, VENUE_ID, DURATION, shortExpiry, true);

      // 2時間後に移動して期限切れにする
      await time.increase(Number(ONE_HOUR * 2n));

      await expect(nft.connect(operator).consumePass(1n, 10n))
        .to.be.revertedWithCustomError(nft, 'PassExpired');
    });
  });

  // -----------------------------------------------------------------------
  // suspendPass / reactivatePass
  // -----------------------------------------------------------------------

  describe('suspendPass / reactivatePass', () => {
    it('一時停止と再有効化ができる', async () => {
      const { nft, operator, user } = await deploy();
      const expiresAt = await futureExpiry();
      await nft.connect(operator).mint(user.address, PLAN_ID, VENUE_ID, DURATION, expiresAt, true);

      await expect(nft.connect(operator).suspendPass(1n))
        .to.emit(nft, 'PassSuspended')
        .withArgs(1n);
      expect((await nft.passes(1n)).isActive).to.equal(false);

      await expect(nft.connect(operator).reactivatePass(1n))
        .to.emit(nft, 'PassReactivated')
        .withArgs(1n);
      expect((await nft.passes(1n)).isActive).to.equal(true);
    });
  });

  // -----------------------------------------------------------------------
  // isPassValid
  // -----------------------------------------------------------------------

  describe('isPassValid', () => {
    it('有効なパスは true を返す', async () => {
      const { nft, operator, user } = await deploy();
      const expiresAt = await futureExpiry();
      await nft.connect(operator).mint(user.address, PLAN_ID, VENUE_ID, DURATION, expiresAt, true);
      expect(await nft.isPassValid(1n)).to.equal(true);
    });

    it('一時停止されたパスは false を返す', async () => {
      const { nft, operator, user } = await deploy();
      const expiresAt = await futureExpiry();
      await nft.connect(operator).mint(user.address, PLAN_ID, VENUE_ID, DURATION, expiresAt, true);
      await nft.connect(operator).suspendPass(1n);
      expect(await nft.isPassValid(1n)).to.equal(false);
    });

    it('期限切れパスは false を返す', async () => {
      const { nft, operator, user } = await deploy();
      const shortExpiry = BigInt(await time.latest()) + ONE_HOUR;
      await nft.connect(operator).mint(user.address, PLAN_ID, VENUE_ID, DURATION, shortExpiry, true);
      await time.increase(Number(ONE_HOUR * 2n));
      expect(await nft.isPassValid(1n)).to.equal(false);
    });

    it('残り分数0のパスは false を返す', async () => {
      const { nft, operator, user } = await deploy();
      const expiresAt = await futureExpiry();
      await nft.connect(operator).mint(user.address, PLAN_ID, VENUE_ID, 30n, expiresAt, true);
      await nft.connect(operator).consumePass(1n, 30n);
      expect(await nft.isPassValid(1n)).to.equal(false);
    });
  });

  // -----------------------------------------------------------------------
  // 譲渡：transferable フラグ + クールダウン
  // -----------------------------------------------------------------------

  describe('transfer restrictions', () => {
    it('譲渡不可パスの転送を拒否する', async () => {
      const { nft, operator, user, other } = await deploy();
      const expiresAt = await futureExpiry();
      // transferable=false でミント
      await nft.connect(operator).mint(user.address, PLAN_ID, VENUE_ID, DURATION, expiresAt, false);

      await expect(
        nft.connect(user).transferFrom(user.address, other.address, 1n),
      ).to.be.revertedWithCustomError(nft, 'NotTransferable');
    });

    it('クールダウン期間中の転送を拒否する', async () => {
      const { nft, operator, user, other } = await deploy();
      const expiresAt = await futureExpiry();
      await nft.connect(operator).mint(user.address, PLAN_ID, VENUE_ID, DURATION, expiresAt, true);

      // 1回目の転送は成功
      await nft.connect(user).transferFrom(user.address, other.address, 1n);

      // クールダウン内（12時間後）に2回目を試みる
      await time.increase(Number(ONE_HOUR * 12n));

      await expect(
        nft.connect(other).transferFrom(other.address, user.address, 1n),
      ).to.be.revertedWithCustomError(nft, 'CooldownActive');
    });

    it('クールダウン後は転送できる', async () => {
      const { nft, operator, user, other } = await deploy();
      const expiresAt = await futureExpiry();
      await nft.connect(operator).mint(user.address, PLAN_ID, VENUE_ID, DURATION, expiresAt, true);

      await nft.connect(user).transferFrom(user.address, other.address, 1n);

      // 25時間後（クールダウン24時間を超える）
      await time.increase(Number(ONE_HOUR * 25n));

      await expect(
        nft.connect(other).transferFrom(other.address, user.address, 1n),
      ).to.emit(nft, 'Transfer');

      expect(await nft.ownerOf(1n)).to.equal(user.address);
    });

    it('lastTransferTime が転送時刻を正しく記録する', async () => {
      const { nft, operator, user, other } = await deploy();
      const expiresAt = await futureExpiry();
      await nft.connect(operator).mint(user.address, PLAN_ID, VENUE_ID, DURATION, expiresAt, true);

      const tx = await nft.connect(user).transferFrom(user.address, other.address, 1n);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);

      expect(await nft.lastTransferTime(1n)).to.equal(BigInt(block!.timestamp));
    });
  });

  // -----------------------------------------------------------------------
  // getPass
  // -----------------------------------------------------------------------

  describe('getPass', () => {
    it('PassData を返す', async () => {
      const { nft, operator, user } = await deploy();
      const expiresAt = await futureExpiry();
      await nft.connect(operator).mint(user.address, PLAN_ID, VENUE_ID, DURATION, expiresAt, true);

      const pass = await nft.getPass(1n);
      expect(pass.planId).to.equal(PLAN_ID);
      expect(pass.venueId).to.equal(VENUE_ID);
      expect(pass.remainingMinutes).to.equal(DURATION);
    });
  });
});
