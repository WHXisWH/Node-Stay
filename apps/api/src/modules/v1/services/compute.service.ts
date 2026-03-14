import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../../../prisma/prisma.service';
import { ComputeRightContractService } from '../../../blockchain/compute-right.contract.service';
import { UserService } from './user.service';
import { BlockchainService } from '../../../blockchain/blockchain.service';
import { FeatureFlagsService } from './featureFlags.service';

@Injectable()
export class ComputeService {
  private readonly logger = new Logger(ComputeService.name);
  private readonly erc20Iface = new ethers.Interface([
    'event Transfer(address indexed from, address indexed to, uint256 value)',
  ]);

  constructor(
    private readonly prisma: PrismaService,
    private readonly computeRightContract: ComputeRightContractService,
    private readonly userService: UserService,
    private readonly blockchain: BlockchainService,
    private readonly flags: FeatureFlagsService,
  ) {}

  private requireWalletAddress(wallet: string | null | undefined, label: string): string {
    const normalized = wallet?.trim() ?? '';
    if (!normalized || !ethers.isAddress(normalized) || normalized === ethers.ZeroAddress) {
      throw new HttpException(
        { message: `${label}のウォレットアドレスが不正です` },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    return ethers.getAddress(normalized);
  }

  private normalizeNodeId(machineId: string): `0x${string}` {
    if (/^0x[0-9a-fA-F]{64}$/.test(machineId)) {
      return machineId as `0x${string}`;
    }
    return ethers.id(machineId) as `0x${string}`;
  }

  private parsePositiveMajorPrice(raw: string): bigint {
    let major: bigint;
    try {
      major = BigInt(raw);
    } catch {
      throw new HttpException(
        { message: '算力価格の形式が不正です' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (major <= 0n) {
      throw new HttpException(
        { message: '算力価格が0以下です' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    return major;
  }

  private async resolveProductForNodeId(nodeId: string) {
    const byProductId = await this.prisma.computeProduct.findUnique({
      where: { id: nodeId },
      include: { machine: true },
    });
    if (byProductId) return byProductId;

    const byMachineId = await this.prisma.machine.findUnique({
      where: { id: nodeId },
      include: {
        computeProducts: {
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (byMachineId?.computeProducts[0]) {
      return {
        ...byMachineId.computeProducts[0],
        machine: byMachineId,
      };
    }

    const byOnchainMachineId = await this.prisma.machine.findFirst({
      where: { machineId: nodeId },
      include: {
        computeProducts: {
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
    if (byOnchainMachineId?.computeProducts[0]) {
      return {
        ...byOnchainMachineId.computeProducts[0],
        machine: byOnchainMachineId,
      };
    }

    return null;
  }

  private async verifyPaymentTransferOrThrow(input: {
    txHash: string;
    buyerWallet: string;
    expectedAmountWei: bigint;
  }) {
    if (!this.blockchain.isEnabled) {
      throw new HttpException(
        { message: 'ブロックチェーン接続が無効です' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const tokenAddressRaw = process.env.JPYC_TOKEN_ADDRESS?.trim();
    const computeRightAddressRaw = process.env.COMPUTE_RIGHT_ADDRESS?.trim();
    if (!tokenAddressRaw || !ethers.isAddress(tokenAddressRaw)) {
      throw new HttpException(
        { message: 'JPYC_TOKEN_ADDRESSが未設定です' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (!computeRightAddressRaw || !ethers.isAddress(computeRightAddressRaw)) {
      throw new HttpException(
        { message: 'COMPUTE_RIGHT_ADDRESSが未設定です' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const tokenAddress = tokenAddressRaw.toLowerCase();
    const computeRightAddress = computeRightAddressRaw.toLowerCase();
    const buyerWallet = input.buyerWallet.toLowerCase();

    const receipt = await this.blockchain.provider.getTransactionReceipt(input.txHash);
    if (!receipt || receipt.status !== 1) {
      throw new HttpException(
        { message: 'JPYC支払いトランザクションを確認できません' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    let paid = 0n;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== tokenAddress) continue;
      let parsed: ethers.LogDescription | null = null;
      try {
        parsed = this.erc20Iface.parseLog(log);
      } catch {
        parsed = null;
      }
      if (!parsed || parsed.name !== 'Transfer') continue;

      const from = String(parsed.args.from).toLowerCase();
      const to = String(parsed.args.to).toLowerCase();
      const value = parsed.args.value as bigint;
      if (from !== buyerWallet) continue;
      if (to !== computeRightAddress) continue;
      paid += value;
    }

    if (paid < input.expectedAmountWei) {
      throw new HttpException(
        { message: 'JPYC支払い額が不足しています' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  async listMachines(venueId?: string) {
    const rows = await this.prisma.machine.findMany({
      where: {
        status: { in: ['REGISTERED', 'ACTIVE'] },
        onchainTokenId: { not: null },
        ...(venueId ? { venueId } : {}),
        computeProducts: { some: { status: 'ACTIVE' } },
      },
      include: {
        venue: {
          select: {
            name: true,
            address: true,
          },
        },
        computeProducts: {
          where: { status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            priceJpyc: true,
            maxDurationMinutes: true,
          },
        },
      },
    });

    return rows.map((m) => {
      const product = m.computeProducts[0];
      if (!product) return null;
      const nodeId = product?.id ?? m.id;
      const status = m.status === 'ACTIVE' ? 'IDLE' : 'OFFLINE';
      const pricePerHourMinor = product ? Number(product.priceJpyc || '0') * 100 : 0;

      return {
        nodeId,
        computeProductId: product.id,
        venueId: m.venueId,
        seatId: m.localSerial ?? m.id.slice(0, 8),
        status,
        pricePerHourMinor,
        machineId: m.machineId,
        onchainTokenId: m.onchainTokenId,
        machineClass: m.machineClass,
        gpu: m.gpu,
        cpu: m.cpu,
        ramGb: m.ramGb,
        maxDurationMinutes: product?.maxDurationMinutes ?? null,
        venueName: m.venue?.name ?? null,
        address: m.venue?.address ?? null,
      };
    }).filter((v): v is NonNullable<typeof v> => v !== null);
  }

  async submitJob(input: {
    requesterAddress: string;
    requesterUserAddress?: string;
    requesterId?: string;
    nodeId: string;
    estimatedHours: number;
    jobType: string;
    schedulerRef?: string;
    paymentTxHash?: string | null;
  }) {
    const buyerWallet = this.requireWalletAddress(input.requesterAddress, '購入者');
    const buyerUserId = await this.userService.findOrCreateByWallet(
      input.requesterUserAddress ?? buyerWallet,
    );

    const product = await this.resolveProductForNodeId(input.nodeId);
    if (!product) {
      throw new HttpException({ message: '算力ノードが見つかりません' }, HttpStatus.NOT_FOUND);
    }
    if (product.status !== 'ACTIVE' || product.machine.status !== 'ACTIVE') {
      throw new HttpException({ message: '算力ノードが現在利用できません' }, HttpStatus.CONFLICT);
    }
    if (!product.machine.onchainTokenId) {
      throw new HttpException({ message: 'ノードがオンチェーン未登録です' }, HttpStatus.UNPROCESSABLE_ENTITY);
    }
    if (!product.machine.machineId) {
      throw new HttpException({ message: 'ノード識別子が不正です' }, HttpStatus.UNPROCESSABLE_ENTITY);
    }

    const maxHours =
      product.maxDurationMinutes && product.maxDurationMinutes > 0
        ? Math.max(1, Math.floor(product.maxDurationMinutes / 60))
        : 24;
    if (input.estimatedHours > maxHours) {
      throw new HttpException(
        { message: `予約時間は最大 ${maxHours} 時間までです` },
        HttpStatus.BAD_REQUEST,
      );
    }

    const hourlyPriceMajor = this.parsePositiveMajorPrice(product.priceJpyc);
    const totalPriceMajor = hourlyPriceMajor * BigInt(input.estimatedHours);
    const totalPriceWei = totalPriceMajor * (10n ** 18n);

    if (this.flags.strictOnchainModeEnabled() && !input.paymentTxHash) {
      throw new HttpException(
        { message: '支払いトランザクション（paymentTxHash）が必須です' },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (input.paymentTxHash) {
      await this.verifyPaymentTransferOrThrow({
        txHash: input.paymentTxHash,
        buyerWallet,
        expectedAmountWei: totalPriceWei,
      });
    }

    const durationSeconds = BigInt(input.estimatedHours * 3600);
    const nodeId = this.normalizeNodeId(product.machine.machineId);

    this.logger.log(
      `[compute.submit] start buyer=${buyerWallet} nodeId=${nodeId} estimatedHours=${input.estimatedHours} totalWei=${totalPriceWei.toString()} paymentTx=${input.paymentTxHash ?? 'none'}`,
    );

    const onchain = await this.computeRightContract.mintComputeRight({
      to: buyerWallet,
      nodeId,
      durationSeconds,
      priceJpyc: totalPriceWei,
    });
    if (!onchain) {
      this.logger.error('[compute.submit] mintComputeRight failed');
      throw new HttpException(
        { message: 'オンチェーン算力権発行に失敗しました' },
        HttpStatus.BAD_GATEWAY,
      );
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const right = await tx.computeRight.create({
        data: {
          computeProductId: product.id,
          machineId: product.machineId,
          ownerUserId: buyerUserId,
          onchainTokenId: onchain.tokenId.toString(),
          onchainTxHash: onchain.txHash,
          status: 'ISSUED',
        },
      });

      let parsedSchedulerRef: unknown = null;
      if (input.schedulerRef) {
        try {
          parsedSchedulerRef = JSON.parse(input.schedulerRef);
        } catch {
          parsedSchedulerRef = input.schedulerRef;
        }
      }
      const schedulerPayload = parsedSchedulerRef
        ? JSON.stringify({
            task: parsedSchedulerRef,
            nodeId: input.nodeId,
            estimatedHours: input.estimatedHours,
            paymentTxHash: input.paymentTxHash ?? null,
            payerWallet: buyerWallet,
          })
        : null;

      const job = await tx.computeJob.create({
        data: {
          computeRightId: right.id,
          buyerUserId,
          jobType: input.jobType,
          schedulerRef: schedulerPayload,
          status: 'PENDING',
          onchainTxHash: onchain.txHash,
        },
      });

      return {
        id: job.id,
        computeRightId: right.id,
        onchainTokenId: right.onchainTokenId ?? '',
        onchainTxHash: right.onchainTxHash ?? '',
      };
    });

    this.logger.log(
      `[compute.submit] done jobId=${created.id} rightId=${created.computeRightId} tokenId=${created.onchainTokenId} txHash=${created.onchainTxHash}`,
    );
    return created;
  }

  async getJob(jobId: string) {
    return this.prisma.computeJob.findUnique({ where: { id: jobId } });
  }

  async cancelJob(jobId: string) {
    const job = await this.prisma.computeJob.findUnique({
      where: { id: jobId },
      include: { computeRight: true },
    });
    if (!job) return null;
    if (!['PENDING', 'ASSIGNED', 'RUNNING'].includes(job.status)) return null;
    if (!job.computeRight?.onchainTokenId) {
      throw new HttpException(
        { message: 'オンチェーン算力権が未設定のためキャンセルできません' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (!job.buyerUserId) {
      throw new HttpException(
        { message: '購入者情報が未設定のためキャンセルできません' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const buyer = await this.prisma.user.findUnique({
      where: { id: job.buyerUserId },
      select: { walletAddress: true },
    });
    let schedulerPayerWallet: string | null = null;
    if (job.schedulerRef) {
      try {
        const parsed = JSON.parse(job.schedulerRef) as { payerWallet?: unknown };
        if (typeof parsed.payerWallet === 'string') {
          schedulerPayerWallet = parsed.payerWallet;
        }
      } catch {
        schedulerPayerWallet = null;
      }
    }
    const buyerWallet = this.requireWalletAddress(
      schedulerPayerWallet ?? buyer?.walletAddress,
      '購入者',
    );
    const tokenId = BigInt(job.computeRight.onchainTokenId);
    const chainData = await this.computeRightContract.getComputeData(tokenId);
    if (!chainData) {
      throw new HttpException(
        { message: 'オンチェーン状態の取得に失敗しました' },
        HttpStatus.BAD_GATEWAY,
      );
    }
    if (![1, 2].includes(chainData.status)) {
      throw new HttpException(
        { message: 'このジョブ状態はオンチェーン取消に未対応です' },
        HttpStatus.CONFLICT,
      );
    }

    this.logger.log(`[compute.cancel] start jobId=${jobId} tokenId=${tokenId.toString()} buyer=${buyerWallet}`);
    const txHash = await this.computeRightContract.failJob(tokenId, buyerWallet);
    if (!txHash) {
      throw new HttpException(
        { message: 'オンチェーンキャンセルに失敗しました' },
        HttpStatus.BAD_GATEWAY,
      );
    }
    this.logger.log(`[compute.cancel] done jobId=${jobId} txHash=${txHash}`);

    return this.prisma.$transaction(async (tx) => {
      await tx.computeRight.update({
        where: { id: job.computeRight!.id },
        data: { status: 'FAILED' },
      });

      return tx.computeJob.update({
        where: { id: jobId },
        data: { status: 'CANCELLED', onchainTxHash: txHash, endedAt: new Date() },
      });
    });
  }

  // -----------------------------------------------------------------------
  // 算力プロダクト一覧を取得する（venueId でフィルタ可能）
  // -----------------------------------------------------------------------
  async listProducts(venueId?: string) {
    return this.prisma.computeProduct.findMany({
      where: {
        status: 'ACTIVE',
        ...(venueId
          ? { machine: { venueId } }
          : {}),
      },
      include: {
        machine: {
          select: {
            id: true,
            venueId: true,
            machineClass: true,
            cpu: true,
            gpu: true,
            ramGb: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // -----------------------------------------------------------------------
  // 算力プロダクトを ID で取得する
  // -----------------------------------------------------------------------
  async getProduct(id: string) {
    return this.prisma.computeProduct.findUnique({
      where: { id },
      include: {
        machine: {
          select: {
            id: true,
            venueId: true,
            machineClass: true,
            cpu: true,
            gpu: true,
            ramGb: true,
          },
        },
      },
    });
  }

  // -----------------------------------------------------------------------
  // ジョブの実行結果を取得する
  // -----------------------------------------------------------------------
  async getJobResult(jobId: string) {
    const job = await this.prisma.computeJob.findUnique({ where: { id: jobId } });
    if (!job) return null;
    return {
      jobId: job.id,
      status: job.status,
      resultHash: job.resultHash,
      startedAt: job.startedAt,
      endedAt: job.endedAt,
      interruptionReason: job.interruptionReason,
    };
  }
}
