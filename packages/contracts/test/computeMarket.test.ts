import { expect } from 'chai';
import { ethers } from 'hardhat';

// ジョブステータスの列挙型（コントラクトと一致させる）
const JobStatus = {
  PENDING:   0n,
  ASSIGNED:  1n,
  RUNNING:   2n,
  COMPLETED: 3n,
  FAILED:    4n,
  CANCELLED: 5n,
} as const;

// テスト用ノードパラメータ
const NODE_PRICE_PER_HOUR = 500n;  // 500 JPYCマイナー / 時間
const MIN_HOURS           = 1n;
const MAX_HOURS           = 8n;
const EST_HOURS           = 2n;
const DEPOSIT             = NODE_PRICE_PER_HOUR * EST_HOURS; // 1000

// プラットフォーム手数料: 25%（BPS=250 / 分母=1000）
const PLATFORM_FEE_BPS  = 250n;
const FEE_DENOMINATOR   = 1000n;

describe('ComputeMarket', () => {
  // -----------------------------------------------------------------------
  // セットアップヘルパー
  // -----------------------------------------------------------------------

  async function deploy() {
    const [owner, operator, venue, requester, platform, other] = await ethers.getSigners();

    const Token = await ethers.getContractFactory('MockERC20');
    const token = await Token.deploy();

    const Market = await ethers.getContractFactory('ComputeMarket');
    const market = await Market.deploy(await token.getAddress(), platform.address);

    await market.setOperator(operator.address);

    return { market, token, owner, operator, venue, requester, platform, other };
  }

  // テスト用nodeIdの生成
  function makeNodeId(seed: string): string {
    return ethers.keccak256(ethers.toUtf8Bytes(seed));
  }

  // ノードを登録するヘルパー
  async function registerNode(
    market: Awaited<ReturnType<typeof deploy>>['market'],
    operator: Awaited<ReturnType<typeof deploy>>['operator'],
    venue: Awaited<ReturnType<typeof deploy>>['venue'],
    seed = 'node-001',
  ) {
    const nodeId = makeNodeId(seed);
    await market.connect(operator).registerNode(
      nodeId,
      venue.address,
      NODE_PRICE_PER_HOUR,
      MIN_HOURS,
      MAX_HOURS,
    );
    return nodeId;
  }

  // ジョブを PENDING 状態で作成するヘルパー
  async function submitJob(
    ctx: Awaited<ReturnType<typeof deploy>>,
    nodeId: string,
  ) {
    const { market, token, requester } = ctx;
    const marketAddr = await market.getAddress();
    await token.mint(requester.address, DEPOSIT * 10n);
    await token.connect(requester).approve(marketAddr, DEPOSIT);
    const tx = await market.connect(requester).submitJob(nodeId, EST_HOURS);
    await tx.wait();
    return 1n; // 最初のジョブID
  }

  // -----------------------------------------------------------------------
  // コンストラクタ / 管理関数
  // -----------------------------------------------------------------------

  describe('constructor', () => {
    it('token=0 を拒否する', async () => {
      const [, , , , platform] = await ethers.getSigners();
      const Market = await ethers.getContractFactory('ComputeMarket');
      await expect(
        Market.deploy(ethers.ZeroAddress, platform.address),
      ).to.be.revertedWithCustomError(Market, 'ZeroAddress');
    });

    it('platformFeeRecipient=0 を拒否する', async () => {
      const Token = await ethers.getContractFactory('MockERC20');
      const token = await Token.deploy();
      const Market = await ethers.getContractFactory('ComputeMarket');
      await expect(
        Market.deploy(await token.getAddress(), ethers.ZeroAddress),
      ).to.be.revertedWithCustomError(Market, 'ZeroAddress');
    });
  });

  describe('setOperator', () => {
    it('オーナーがオペレータを設定できる', async () => {
      const { market, owner, operator } = await deploy();
      await expect(market.connect(owner).setOperator(operator.address))
        .to.emit(market, 'OperatorUpdated')
        .withArgs(operator.address);
    });

    it('ゼロアドレスを拒否する', async () => {
      const { market, owner } = await deploy();
      await expect(market.connect(owner).setOperator(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(market, 'ZeroAddress');
    });

    it('オーナー以外を拒否する', async () => {
      const { market, other } = await deploy();
      await expect(market.connect(other).setOperator(other.address))
        .to.be.revertedWithCustomError(market, 'OwnableUnauthorizedAccount');
    });
  });

  describe('setPlatformFeeRecipient', () => {
    it('オーナーが変更できる', async () => {
      const { market, owner, other } = await deploy();
      await expect(market.connect(owner).setPlatformFeeRecipient(other.address))
        .to.emit(market, 'PlatformFeeRecipientUpdated')
        .withArgs(other.address);
    });

    it('ゼロアドレスを拒否する', async () => {
      const { market, owner } = await deploy();
      await expect(market.connect(owner).setPlatformFeeRecipient(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(market, 'ZeroAddress');
    });
  });

  // -----------------------------------------------------------------------
  // ノード管理
  // -----------------------------------------------------------------------

  describe('registerNode', () => {
    it('ノードを登録できる', async () => {
      const { market, operator, venue } = await deploy();
      const nodeId = makeNodeId('node-001');

      await expect(
        market.connect(operator).registerNode(nodeId, venue.address, NODE_PRICE_PER_HOUR, MIN_HOURS, MAX_HOURS),
      )
        .to.emit(market, 'NodeRegistered')
        .withArgs(nodeId, venue.address, NODE_PRICE_PER_HOUR);

      const node = await market.getNode(nodeId);
      expect(node.venueOwner).to.equal(venue.address);
      expect(node.pricePerHourMinor).to.equal(NODE_PRICE_PER_HOUR);
      expect(node.minBookingHours).to.equal(MIN_HOURS);
      expect(node.maxBookingHours).to.equal(MAX_HOURS);
      expect(node.active).to.equal(true);
      expect(await market.getNodeCount()).to.equal(1n);
    });

    it('同じ nodeId の二重登録を拒否する', async () => {
      const { market, operator, venue } = await deploy();
      const nodeId = makeNodeId('node-dup');
      await market.connect(operator).registerNode(nodeId, venue.address, NODE_PRICE_PER_HOUR, MIN_HOURS, MAX_HOURS);
      await expect(
        market.connect(operator).registerNode(nodeId, venue.address, NODE_PRICE_PER_HOUR, MIN_HOURS, MAX_HOURS),
      ).to.be.revertedWithCustomError(market, 'NodeAlreadyExists');
    });

    it('venueOwner=0 を拒否する', async () => {
      const { market, operator } = await deploy();
      const nodeId = makeNodeId('node-zero-owner');
      await expect(
        market.connect(operator).registerNode(nodeId, ethers.ZeroAddress, NODE_PRICE_PER_HOUR, MIN_HOURS, MAX_HOURS),
      ).to.be.revertedWithCustomError(market, 'ZeroAddress');
    });

    it('pricePerHourMinor=0 を拒否する', async () => {
      const { market, operator, venue } = await deploy();
      const nodeId = makeNodeId('node-zero-price');
      await expect(
        market.connect(operator).registerNode(nodeId, venue.address, 0n, MIN_HOURS, MAX_HOURS),
      ).to.be.revertedWithCustomError(market, 'InvalidPrice');
    });

    it('minBookingHours=0 を拒否する', async () => {
      const { market, operator, venue } = await deploy();
      const nodeId = makeNodeId('node-zero-min');
      await expect(
        market.connect(operator).registerNode(nodeId, venue.address, NODE_PRICE_PER_HOUR, 0n, MAX_HOURS),
      ).to.be.revertedWithCustomError(market, 'InvalidBookingHours');
    });

    it('min > max を拒否する', async () => {
      const { market, operator, venue } = await deploy();
      const nodeId = makeNodeId('node-inv-range');
      await expect(
        market.connect(operator).registerNode(nodeId, venue.address, NODE_PRICE_PER_HOUR, 5n, 3n),
      ).to.be.revertedWithCustomError(market, 'InvalidBookingHours');
    });

    it('オペレータ以外を拒否する', async () => {
      const { market, venue, other } = await deploy();
      const nodeId = makeNodeId('node-unauth');
      await expect(
        market.connect(other).registerNode(nodeId, venue.address, NODE_PRICE_PER_HOUR, MIN_HOURS, MAX_HOURS),
      ).to.be.revertedWithCustomError(market, 'NotOperator');
    });
  });

  describe('updateNode', () => {
    it('ノード情報を更新できる', async () => {
      const ctx = await deploy();
      const nodeId = await registerNode(ctx.market, ctx.operator, ctx.venue);

      await expect(ctx.market.connect(ctx.operator).updateNode(nodeId, 1000n, 2n, 12n))
        .to.emit(ctx.market, 'NodeUpdated')
        .withArgs(nodeId);

      const node = await ctx.market.getNode(nodeId);
      expect(node.pricePerHourMinor).to.equal(1000n);
      expect(node.minBookingHours).to.equal(2n);
      expect(node.maxBookingHours).to.equal(12n);
    });

    it('存在しないノードを拒否する', async () => {
      const { market, operator } = await deploy();
      const fakeId = makeNodeId('non-existent');
      await expect(
        market.connect(operator).updateNode(fakeId, 100n, 1n, 5n),
      ).to.be.revertedWithCustomError(market, 'NodeNotFound');
    });
  });

  describe('deactivateNode / activateNode', () => {
    it('有効化・無効化を切り替えられる', async () => {
      const ctx = await deploy();
      const nodeId = await registerNode(ctx.market, ctx.operator, ctx.venue);

      await expect(ctx.market.connect(ctx.operator).deactivateNode(nodeId))
        .to.emit(ctx.market, 'NodeDeactivated')
        .withArgs(nodeId);
      expect((await ctx.market.getNode(nodeId)).active).to.equal(false);

      await expect(ctx.market.connect(ctx.operator).activateNode(nodeId))
        .to.emit(ctx.market, 'NodeActivated')
        .withArgs(nodeId);
      expect((await ctx.market.getNode(nodeId)).active).to.equal(true);
    });

    it('存在しないノードを拒否する', async () => {
      const { market, operator } = await deploy();
      const fakeId = makeNodeId('non-existent');
      await expect(market.connect(operator).deactivateNode(fakeId))
        .to.be.revertedWithCustomError(market, 'NodeNotFound');
      await expect(market.connect(operator).activateNode(fakeId))
        .to.be.revertedWithCustomError(market, 'NodeNotFound');
    });
  });

  // -----------------------------------------------------------------------
  // ジョブライフサイクル（正常系: PENDING→ASSIGNED→RUNNING→COMPLETED）
  // -----------------------------------------------------------------------

  describe('full job lifecycle', () => {
    it('submitJob → assignJob → startJob → completeJob が正しく動作する', async () => {
      const ctx = await deploy();
      const { market, token, operator, venue, requester, platform } = ctx;

      const nodeId = await registerNode(market, operator, venue);
      const marketAddr = await market.getAddress();
      await token.mint(requester.address, DEPOSIT);
      await token.connect(requester).approve(marketAddr, DEPOSIT);

      // submitJob
      await expect(market.connect(requester).submitJob(nodeId, EST_HOURS))
        .to.emit(market, 'JobSubmitted')
        .withArgs(1n, nodeId, requester.address, DEPOSIT);

      // エスクロー確認
      expect(await token.balanceOf(marketAddr)).to.equal(DEPOSIT);

      const job = await market.getJob(1n);
      expect(job.nodeId).to.equal(nodeId);
      expect(job.requester).to.equal(requester.address);
      expect(job.depositMinor).to.equal(DEPOSIT);
      expect(job.status).to.equal(JobStatus.PENDING);

      // assignJob
      await expect(market.connect(operator).assignJob(1n))
        .to.emit(market, 'JobAssigned')
        .withArgs(1n);
      expect((await market.getJob(1n)).status).to.equal(JobStatus.ASSIGNED);

      // startJob
      await expect(market.connect(operator).startJob(1n))
        .to.emit(market, 'JobStarted');
      expect((await market.getJob(1n)).status).to.equal(JobStatus.RUNNING);

      // completeJob
      const resultHash = ethers.keccak256(ethers.toUtf8Bytes('result-data'));
      const platformFee = (DEPOSIT * PLATFORM_FEE_BPS) / FEE_DENOMINATOR;
      const venueAmount = DEPOSIT - platformFee;

      const venueBalBefore    = await token.balanceOf(venue.address);
      const platformBalBefore = await token.balanceOf(platform.address);

      await expect(market.connect(operator).completeJob(1n, resultHash))
        .to.emit(market, 'JobCompleted')
        .withArgs(1n, resultHash, venueAmount, platformFee);

      // 収益分配の確認
      expect(await token.balanceOf(venue.address)).to.equal(venueBalBefore + venueAmount);
      expect(await token.balanceOf(platform.address)).to.equal(platformBalBefore + platformFee);
      expect(await token.balanceOf(marketAddr)).to.equal(0n);

      // 最終ステータス確認
      const completedJob = await market.getJob(1n);
      expect(completedJob.status).to.equal(JobStatus.COMPLETED);
      expect(completedJob.resultHash).to.equal(resultHash);
      expect(completedJob.endedAt).to.be.gt(0n);
    });

    it('収益分配の比率が正確（75%:25%）', async () => {
      const ctx = await deploy();
      const { market, token, operator, venue, requester, platform } = ctx;

      const nodeId = await registerNode(market, operator, venue);
      const marketAddr = await market.getAddress();

      // 1000 JPYC をデポジット
      const deposit = 1000n;
      await token.mint(requester.address, deposit);
      await token.connect(requester).approve(marketAddr, deposit);

      await market.connect(requester).submitJob(nodeId, 2n); // 500*2=1000
      await market.connect(operator).assignJob(1n);
      await market.connect(operator).startJob(1n);
      await market.connect(operator).completeJob(1n, ethers.ZeroHash);

      // 250 → platform、750 → venue
      expect(await token.balanceOf(platform.address)).to.equal(250n);
      expect(await token.balanceOf(venue.address)).to.equal(750n);
    });
  });

  // -----------------------------------------------------------------------
  // failJob
  // -----------------------------------------------------------------------

  describe('failJob', () => {
    it('RUNNING状態のジョブを失敗させ全額返金できる', async () => {
      const ctx = await deploy();
      const nodeId = await registerNode(ctx.market, ctx.operator, ctx.venue);
      const jobId = await submitJob(ctx, nodeId);

      await ctx.market.connect(ctx.operator).assignJob(jobId);
      await ctx.market.connect(ctx.operator).startJob(jobId);

      const requesterBalBefore = await ctx.token.balanceOf(ctx.requester.address);

      await expect(ctx.market.connect(ctx.operator).failJob(jobId))
        .to.emit(ctx.market, 'JobFailed')
        .withArgs(jobId, DEPOSIT);

      expect(await ctx.token.balanceOf(ctx.requester.address)).to.equal(requesterBalBefore + DEPOSIT);
      expect((await ctx.market.getJob(jobId)).status).to.equal(JobStatus.FAILED);
    });

    it('ASSIGNED状態のジョブも失敗させられる', async () => {
      const ctx = await deploy();
      const nodeId = await registerNode(ctx.market, ctx.operator, ctx.venue);
      const jobId = await submitJob(ctx, nodeId);

      await ctx.market.connect(ctx.operator).assignJob(jobId);

      await expect(ctx.market.connect(ctx.operator).failJob(jobId))
        .to.emit(ctx.market, 'JobFailed');
    });

    it('PENDING状態からの failJob を拒否する', async () => {
      const ctx = await deploy();
      const nodeId = await registerNode(ctx.market, ctx.operator, ctx.venue);
      const jobId = await submitJob(ctx, nodeId);

      await expect(ctx.market.connect(ctx.operator).failJob(jobId))
        .to.be.revertedWithCustomError(ctx.market, 'InvalidJobTransition');
    });
  });

  // -----------------------------------------------------------------------
  // cancelJob
  // -----------------------------------------------------------------------

  describe('cancelJob', () => {
    it('PENDING状態を依頼者がキャンセルできる', async () => {
      const ctx = await deploy();
      const nodeId = await registerNode(ctx.market, ctx.operator, ctx.venue);
      const jobId = await submitJob(ctx, nodeId);

      const requesterBalBefore = await ctx.token.balanceOf(ctx.requester.address);

      await expect(ctx.market.connect(ctx.requester).cancelJob(jobId))
        .to.emit(ctx.market, 'JobCancelled')
        .withArgs(jobId, DEPOSIT);

      expect(await ctx.token.balanceOf(ctx.requester.address)).to.equal(requesterBalBefore + DEPOSIT);
      expect((await ctx.market.getJob(jobId)).status).to.equal(JobStatus.CANCELLED);
    });

    it('ASSIGNED状態をオペレータがキャンセルできる', async () => {
      const ctx = await deploy();
      const nodeId = await registerNode(ctx.market, ctx.operator, ctx.venue);
      const jobId = await submitJob(ctx, nodeId);

      await ctx.market.connect(ctx.operator).assignJob(jobId);

      await expect(ctx.market.connect(ctx.operator).cancelJob(jobId))
        .to.emit(ctx.market, 'JobCancelled');
    });

    it('第三者のキャンセルを拒否する', async () => {
      const ctx = await deploy();
      const nodeId = await registerNode(ctx.market, ctx.operator, ctx.venue);
      const jobId = await submitJob(ctx, nodeId);

      await expect(ctx.market.connect(ctx.other).cancelJob(jobId))
        .to.be.revertedWithCustomError(ctx.market, 'NotRequesterOrOperator');
    });

    it('RUNNING状態からのキャンセルを拒否する', async () => {
      const ctx = await deploy();
      const nodeId = await registerNode(ctx.market, ctx.operator, ctx.venue);
      const jobId = await submitJob(ctx, nodeId);

      await ctx.market.connect(ctx.operator).assignJob(jobId);
      await ctx.market.connect(ctx.operator).startJob(jobId);

      await expect(ctx.market.connect(ctx.requester).cancelJob(jobId))
        .to.be.revertedWithCustomError(ctx.market, 'InvalidJobTransition');
    });
  });

  // -----------------------------------------------------------------------
  // エラーケース
  // -----------------------------------------------------------------------

  describe('submitJob errors', () => {
    it('存在しないノードへのジョブを拒否する', async () => {
      const ctx = await deploy();
      const fakeId = makeNodeId('non-existent');
      await expect(ctx.market.connect(ctx.requester).submitJob(fakeId, EST_HOURS))
        .to.be.revertedWithCustomError(ctx.market, 'NodeNotFound');
    });

    it('無効化されたノードへのジョブを拒否する', async () => {
      const ctx = await deploy();
      const nodeId = await registerNode(ctx.market, ctx.operator, ctx.venue);
      await ctx.market.connect(ctx.operator).deactivateNode(nodeId);

      await ctx.token.mint(ctx.requester.address, DEPOSIT);
      await ctx.token.connect(ctx.requester).approve(await ctx.market.getAddress(), DEPOSIT);

      await expect(ctx.market.connect(ctx.requester).submitJob(nodeId, EST_HOURS))
        .to.be.revertedWithCustomError(ctx.market, 'NodeNotActive');
    });

    it('最小予約時間未満のジョブを拒否する', async () => {
      const ctx = await deploy();
      const nodeId = await registerNode(ctx.market, ctx.operator, ctx.venue);

      await ctx.token.mint(ctx.requester.address, NODE_PRICE_PER_HOUR);
      await ctx.token.connect(ctx.requester).approve(await ctx.market.getAddress(), NODE_PRICE_PER_HOUR);

      await expect(ctx.market.connect(ctx.requester).submitJob(nodeId, 0n))
        .to.be.revertedWithCustomError(ctx.market, 'InvalidBookingHours');
    });

    it('最大予約時間超過のジョブを拒否する', async () => {
      const ctx = await deploy();
      const nodeId = await registerNode(ctx.market, ctx.operator, ctx.venue);

      const overDeposit = NODE_PRICE_PER_HOUR * (MAX_HOURS + 1n);
      await ctx.token.mint(ctx.requester.address, overDeposit);
      await ctx.token.connect(ctx.requester).approve(await ctx.market.getAddress(), overDeposit);

      await expect(ctx.market.connect(ctx.requester).submitJob(nodeId, MAX_HOURS + 1n))
        .to.be.revertedWithCustomError(ctx.market, 'InvalidBookingHours');
    });
  });

  describe('job state transition errors', () => {
    it('PENDING状態から startJob を拒否する', async () => {
      const ctx = await deploy();
      const nodeId = await registerNode(ctx.market, ctx.operator, ctx.venue);
      const jobId = await submitJob(ctx, nodeId);

      await expect(ctx.market.connect(ctx.operator).startJob(jobId))
        .to.be.revertedWithCustomError(ctx.market, 'InvalidJobTransition');
    });

    it('存在しないジョブへの操作を拒否する', async () => {
      const { market, operator } = await deploy();
      await expect(market.connect(operator).assignJob(999n))
        .to.be.revertedWithCustomError(market, 'JobNotFound');
      await expect(market.connect(operator).startJob(999n))
        .to.be.revertedWithCustomError(market, 'JobNotFound');
      await expect(market.connect(operator).completeJob(999n, ethers.ZeroHash))
        .to.be.revertedWithCustomError(market, 'JobNotFound');
      await expect(market.connect(operator).failJob(999n))
        .to.be.revertedWithCustomError(market, 'JobNotFound');
    });
  });
});
