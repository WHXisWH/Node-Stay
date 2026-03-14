import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ethers } from 'ethers';
import { PrismaService } from '../../../prisma/prisma.service';
import { RevenueRightContractService } from '../../../blockchain/revenue-right.contract.service';
import { BlockchainService } from '../../../blockchain/blockchain.service';
import { FeatureFlagsService } from './featureFlags.service';
import { UserService } from './user.service';

// -----------------------------------------------------------------------
// 収益プログラムサービス
// RevenueProgram / RevenueRight / RevenueAllocation / RevenueClaim の
// CRUD およびクレームロジックを管理する
// -----------------------------------------------------------------------

@Injectable()
export class RevenueService {
  private readonly logger = new Logger(RevenueService.name);
  private readonly revenueIface = new ethers.Interface([
    'event AllocationRecorded(uint256 indexed allocationId, uint256 indexed programId, uint256 totalAmountJpyc)',
    'event Claimed(address indexed holder, uint256 indexed programId, uint256 indexed allocationId, uint256 amountJpyc)',
  ]);
  private readonly erc20Iface = new ethers.Interface([
    'event Transfer(address indexed from, address indexed to, uint256 value)',
  ]);
  private readonly erc1155Iface = new ethers.Interface([
    'event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value)',
  ]);

  constructor(
    private readonly prisma: PrismaService,
    private readonly revenueContract: RevenueRightContractService,
    private readonly blockchain: BlockchainService,
    private readonly flags: FeatureFlagsService,
    private readonly users: UserService,
  ) {}

  // -----------------------------------------------------------------------
  // userId 解決
  // userId 直接指定が優先。walletAddress 指定時は users テーブルから解決する
  // -----------------------------------------------------------------------
  private async resolveUserId(input: {
    userId?: string;
    walletAddress?: string;
  }): Promise<string | null> {
    if (input.userId) return input.userId;
    if (!input.walletAddress) return null;

    const user = await this.prisma.user.findFirst({
      where: {
        walletAddress: {
          equals: input.walletAddress,
          mode: 'insensitive',
        },
      },
      select: { id: true },
    });
    return user?.id ?? null;
  }

  private toNodeId(machineId: string): string {
    if (/^0x[0-9a-fA-F]{64}$/.test(machineId)) return machineId;
    return ethers.id(machineId);
  }

  private parseAmount(raw: string | null | undefined): bigint {
    try {
      return BigInt(raw ?? '0');
    } catch {
      return 0n;
    }
  }

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

  private async getUserWalletAddress(userId: string, label: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { walletAddress: true },
    });
    return this.requireWalletAddress(user?.walletAddress, label);
  }

  private async resolveOnchainAllocationIdFromTxHash(txHash: string | null | undefined): Promise<string | null> {
    const normalizedTx = txHash?.trim() ?? '';
    if (!/^0x[0-9a-fA-F]{64}$/.test(normalizedTx)) return null;

    const revenueAddress = process.env.REVENUE_RIGHT_ADDRESS?.trim();
    if (!revenueAddress || !ethers.isAddress(revenueAddress)) return null;
    if (!this.blockchain.isEnabled) return null;

    const receipt = await this.blockchain.provider.getTransactionReceipt(normalizedTx);
    if (!receipt || receipt.status !== 1) return null;

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== revenueAddress.toLowerCase()) continue;
      let parsed: ethers.LogDescription | null = null;
      try {
        parsed = this.revenueIface.parseLog(log);
      } catch {
        parsed = null;
      }
      if (!parsed || parsed.name !== 'AllocationRecorded') continue;
      return (parsed.args.allocationId as bigint).toString();
    }

    return null;
  }

  private async verifyClaimTxOrThrow(input: {
    onchainTxHash: string;
    holderWallet: string;
    expectedProgramId: string | null;
    expectedAllocationId: string | null;
  }): Promise<{ claimedAmountJpyc: string }> {
    if (!this.blockchain.isEnabled) {
      throw new HttpException(
        { message: 'ブロックチェーン接続が無効です' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const revenueAddress = process.env.REVENUE_RIGHT_ADDRESS?.trim();
    if (!revenueAddress || !ethers.isAddress(revenueAddress)) {
      throw new HttpException(
        { message: 'REVENUE_RIGHT_ADDRESSが未設定です' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const receipt = await this.blockchain.provider.getTransactionReceipt(input.onchainTxHash);
    if (!receipt || receipt.status !== 1) {
      throw new HttpException(
        { message: 'オンチェーンクレーム取引の確認に失敗しました' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const expectedHolder = input.holderWallet.toLowerCase();
    const expectedProgramId = input.expectedProgramId;
    const expectedAllocationId = input.expectedAllocationId;

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== revenueAddress.toLowerCase()) continue;
      let parsed: ethers.LogDescription | null = null;
      try {
        parsed = this.revenueIface.parseLog(log);
      } catch {
        parsed = null;
      }
      if (!parsed || parsed.name !== 'Claimed') continue;

      const holder = String(parsed.args.holder).toLowerCase();
      const programId = (parsed.args.programId as bigint).toString();
      const allocationId = (parsed.args.allocationId as bigint).toString();
      const amountJpyc = (parsed.args.amountJpyc as bigint).toString();

      if (holder !== expectedHolder) continue;
      if (expectedProgramId && programId !== expectedProgramId) continue;
      if (expectedAllocationId && allocationId !== expectedAllocationId) continue;

      return { claimedAmountJpyc: amountJpyc };
    }

    throw new HttpException(
      { message: 'Claimedイベントが確認できません' },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }

  private requirePositiveIntegerString(value: string, label: string): string {
    const raw = value.trim();
    if (!/^\d+$/.test(raw) || BigInt(raw) <= 0n) {
      throw new HttpException(
        { message: `${label}は正の整数文字列で指定してください` },
        HttpStatus.BAD_REQUEST,
      );
    }
    return raw;
  }

  private async resolveOrCreateUserIdByWallet(walletAddress: string): Promise<string> {
    return this.users.findOrCreateByWallet(walletAddress);
  }

  private getRevenueEscrowWalletOrThrow(): string {
    const configured = process.env.REVENUE_MARKET_ESCROW_WALLET?.trim();
    if (configured) {
      return this.requireWalletAddress(configured, '収益市場エスクロー');
    }
    const operator = this.revenueContract.operatorAddress;
    if (!operator) {
      throw new HttpException(
        { message: '収益市場エスクローアドレスを解決できません' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return this.requireWalletAddress(operator, '収益市場エスクロー');
  }

  private async getReceiptOrThrow(txHash: string): Promise<ethers.TransactionReceipt> {
    if (!this.blockchain.isEnabled) {
      throw new HttpException(
        { message: 'ブロックチェーン接続が無効です' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const receipt = await this.blockchain.provider.getTransactionReceipt(txHash);
    if (!receipt || receipt.status !== 1) {
      throw new HttpException(
        { message: 'オンチェーントランザクションを確認できません' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    return receipt;
  }

  private async verifyRevenueTransferOrThrow(input: {
    txHash: string;
    from: string;
    to: string;
    programId: string;
    amount: string;
  }) {
    const revenueAddress = process.env.REVENUE_RIGHT_ADDRESS?.trim();
    if (!revenueAddress || !ethers.isAddress(revenueAddress)) {
      throw new HttpException(
        { message: 'REVENUE_RIGHT_ADDRESSが未設定です' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const receipt = await this.getReceiptOrThrow(input.txHash);
    const expectedFrom = input.from.toLowerCase();
    const expectedTo = input.to.toLowerCase();
    const expectedProgramId = BigInt(input.programId);
    const expectedAmount = BigInt(input.amount);

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== revenueAddress.toLowerCase()) continue;
      let parsed: ethers.LogDescription | null = null;
      try {
        parsed = this.erc1155Iface.parseLog(log);
      } catch {
        parsed = null;
      }
      if (!parsed || parsed.name !== 'TransferSingle') continue;
      const from = String(parsed.args.from).toLowerCase();
      const to = String(parsed.args.to).toLowerCase();
      const id = parsed.args.id as bigint;
      const value = parsed.args.value as bigint;
      if (from !== expectedFrom) continue;
      if (to !== expectedTo) continue;
      if (id !== expectedProgramId) continue;
      if (value !== expectedAmount) continue;
      return;
    }

    throw new HttpException(
      { message: '収益権TransferSingleイベントを確認できません' },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }

  private async verifyJpycPaymentOrThrow(input: {
    txHash: string;
    buyerWallet: string;
    sellerWallet: string;
    minAmount: string;
  }) {
    const tokenAddress = process.env.JPYC_TOKEN_ADDRESS?.trim();
    if (!tokenAddress || !ethers.isAddress(tokenAddress)) {
      throw new HttpException(
        { message: 'JPYC_TOKEN_ADDRESSが未設定です' },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const receipt = await this.getReceiptOrThrow(input.txHash);
    const fromExpected = input.buyerWallet.toLowerCase();
    const toExpected = input.sellerWallet.toLowerCase();
    const expectedMin = BigInt(input.minAmount);
    let paid = 0n;

    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== tokenAddress.toLowerCase()) continue;
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
      if (from !== fromExpected || to !== toExpected) continue;
      paid += value;
    }

    if (paid < expectedMin) {
      throw new HttpException(
        { message: 'JPYC支払い額が不足しています' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }

  async createProgramDraft(input: {
    merchantId: string;
    machineId: string;
    shareBps: number;
    revenueScope: 'USAGE_ONLY' | 'COMPUTE_ONLY' | 'ALL';
    startAt: Date;
    endAt: Date;
    settlementCycle: 'DAILY' | 'WEEKLY' | 'MONTHLY';
    payoutToken?: string;
    metadataUri?: string;
    investors: Array<{ holderUserId: string; amount1155: string }>;
  }) {
    if (input.shareBps <= 0 || input.shareBps > 4000) {
      throw new HttpException({ message: 'shareBps は 1..4000 の範囲で指定してください' }, HttpStatus.BAD_REQUEST);
    }
    if (input.endAt <= input.startAt) {
      throw new HttpException({ message: 'endAt は startAt より後である必要があります' }, HttpStatus.BAD_REQUEST);
    }
    if (input.investors.length === 0) {
      throw new HttpException({ message: 'investors は 1 件以上必要です' }, HttpStatus.BAD_REQUEST);
    }

    const machine = await this.prisma.machine.findUnique({
      where: { id: input.machineId },
      include: {
        venue: { select: { merchantId: true } },
      },
    });
    if (!machine) {
      throw new HttpException({ message: 'machine が見つかりません' }, HttpStatus.NOT_FOUND);
    }
    if (machine.venue.merchantId !== input.merchantId) {
      throw new HttpException({ message: 'この machine を発行対象にする権限がありません' }, HttpStatus.FORBIDDEN);
    }
    if (!machine.onchainTokenId) {
      throw new HttpException(
        { message: 'machine がオンチェーン未登録のため収益プログラムを作成できません' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (!machine.machineId || machine.machineId === ethers.ZeroHash) {
      throw new HttpException(
        { message: 'machine のオンチェーン識別子が不正です' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const userIds = [...new Set(input.investors.map((v) => v.holderUserId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true },
    });
    if (users.length !== userIds.length) {
      throw new HttpException({ message: 'investors に存在しない userId が含まれています' }, HttpStatus.BAD_REQUEST);
    }

    for (const investor of input.investors) {
      if (this.parseAmount(investor.amount1155) <= 0n) {
        throw new HttpException({ message: 'amount1155 は正の整数文字列である必要があります' }, HttpStatus.BAD_REQUEST);
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const program = await tx.revenueProgram.create({
        data: {
          machineId: input.machineId,
          shareBps: input.shareBps,
          revenueScope: input.revenueScope,
          startAt: input.startAt,
          endAt: input.endAt,
          settlementCycle: input.settlementCycle,
          payoutToken: input.payoutToken ?? 'JPYC',
          metadataUri: input.metadataUri ?? null,
          status: 'PENDING_REVIEW',
        },
      });

      await tx.revenueRight.createMany({
        data: input.investors.map((v) => ({
          revenueProgramId: program.id,
          holderUserId: v.holderUserId,
          amount1155: v.amount1155,
          status: 'PENDING_ISSUE',
        })),
      });

      return program;
    });

    return {
      programId: created.id,
      status: created.status,
      investors: input.investors.length,
    };
  }

  async approveProgram(programId: string, input?: { approverUserId?: string }) {
    const program = await this.prisma.revenueProgram.findUnique({
      where: { id: programId },
      select: { id: true, status: true },
    });
    if (!program) {
      throw new HttpException({ message: '収益プログラムが見つかりません' }, HttpStatus.NOT_FOUND);
    }
    if (program.status !== 'PENDING_REVIEW') {
      throw new HttpException({ message: '承認可能なステータスではありません' }, HttpStatus.CONFLICT);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const next = await tx.revenueProgram.update({
        where: { id: programId },
        data: { status: 'APPROVED' },
      });

      await tx.auditLog.create({
        data: {
          actorType: 'ADMIN',
          actorId: input?.approverUserId ?? null,
          action: 'REVENUE_PROGRAM_APPROVED',
          targetType: 'REVENUE_PROGRAM',
          targetId: programId,
          payload: {
            previousStatus: program.status,
            nextStatus: 'APPROVED',
          },
        },
      });

      return next;
    });

    return {
      programId: updated.id,
      status: updated.status,
    };
  }

  async issueProgram(programId: string, input?: { operatorUserId?: string }) {
    const program = await this.prisma.revenueProgram.findUnique({
      where: { id: programId },
      include: {
        machine: {
          select: { machineId: true, onchainTokenId: true },
        },
        revenueRights: {
          include: {
            holder: {
              select: { id: true, walletAddress: true },
            },
          },
        },
      },
    });
    if (!program) {
      throw new HttpException({ message: '収益プログラムが見つかりません' }, HttpStatus.NOT_FOUND);
    }
    if (program.status !== 'APPROVED') {
      throw new HttpException({ message: '承認済みプログラムのみ発行できます' }, HttpStatus.CONFLICT);
    }
    if (!program.machine?.onchainTokenId) {
      throw new HttpException(
        { message: 'machine がオンチェーン未登録のため発行できません' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const walletToAmount = new Map<string, bigint>();
    for (const right of program.revenueRights) {
      const wallet = right.holder?.walletAddress?.toLowerCase();
      if (!wallet) {
        throw new HttpException(
          { message: `収益権 ${right.id} の holder に walletAddress がありません` },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }

      const amount = this.parseAmount(right.amount1155);
      if (amount <= 0n) continue;

      const prev = walletToAmount.get(wallet) ?? 0n;
      walletToAmount.set(wallet, prev + amount);
    }
    if (walletToAmount.size === 0) {
      throw new HttpException({ message: '発行対象の保有者・数量がありません' }, HttpStatus.UNPROCESSABLE_ENTITY);
    }

    const onchain = await this.revenueContract.createProgram({
      nodeId: this.toNodeId(program.machine.machineId),
      investors: [...walletToAmount.keys()],
      amounts: [...walletToAmount.values()],
      startAt: BigInt(Math.floor(program.startAt.getTime() / 1000)),
      endAt: BigInt(Math.floor(program.endAt.getTime() / 1000)),
      settlementCycle: (program.settlementCycle as 'DAILY' | 'WEEKLY' | 'MONTHLY') ?? 'MONTHLY',
    });
    if (!onchain) {
      throw new HttpException({ message: 'オンチェーン発行に失敗しました' }, HttpStatus.BAD_GATEWAY);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.revenueProgram.update({
        where: { id: program.id },
        data: { status: 'ISSUED' },
      });

      await tx.revenueRight.updateMany({
        where: { revenueProgramId: program.id },
        data: {
          onchainTokenId: onchain.programId.toString(),
          status: 'ACTIVE',
        },
      });

      await tx.auditLog.create({
        data: {
          actorType: 'SYSTEM',
          actorId: input?.operatorUserId ?? null,
          action: 'REVENUE_PROGRAM_ISSUED',
          targetType: 'REVENUE_PROGRAM',
          targetId: program.id,
          payload: {
            txHash: onchain.txHash,
            onchainProgramId: onchain.programId.toString(),
            investorCount: walletToAmount.size,
          },
        },
      });
    });

    return {
      programId: program.id,
      status: 'ISSUED',
      onchainProgramId: onchain.programId.toString(),
      txHash: onchain.txHash,
      investorCount: walletToAmount.size,
    };
  }

  // -----------------------------------------------------------------------
  // 収益プログラム一覧を取得する
  // machineId を指定した場合はその機器のプログラムのみ返す
  // -----------------------------------------------------------------------
  async listPrograms(machineId?: string) {
    return this.prisma.revenueProgram.findMany({
      where: machineId ? { machineId } : undefined,
      include: { machine: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // -----------------------------------------------------------------------
  // 収益プログラムを ID で取得する
  // 見つからない場合は 404 を返す
  // -----------------------------------------------------------------------
  async getProgram(programId: string) {
    const program = await this.prisma.revenueProgram.findUnique({
      where: { id: programId },
      include: {
        revenueRights: true,
        allocations: true,
      },
    });
    if (!program) {
      throw new HttpException(
        { message: '収益プログラムが見つかりません' },
        HttpStatus.NOT_FOUND,
      );
    }
    return program;
  }

  // -----------------------------------------------------------------------
  // ユーザーが保有する収益権一覧を取得する
  // -----------------------------------------------------------------------
  async listMyRights(input: { userId?: string; walletAddress?: string }) {
    const userId = await this.resolveUserId(input);
    if (!userId) return [];

    const rows = await this.prisma.revenueRight.findMany({
      where: { holderUserId: userId },
      include: {
        revenueProgram: {
          include: {
            machine: {
              include: {
                venue: {
                  select: { name: true },
                },
              },
            },
          },
        },
      },
    });

    return rows.map((row) => ({
      ...row,
      onchainProgramId: row.onchainTokenId,
    }));
  }

  // -----------------------------------------------------------------------
  // 指定プログラムの配当アロケーション一覧を取得する
  // -----------------------------------------------------------------------
  async listAllocations(programId: string) {
    const rows = await this.prisma.revenueAllocation.findMany({
      where: { revenueProgramId: programId },
      orderBy: { allocationPeriodStart: 'desc' },
    });

    const withOnchainIds = await Promise.all(
      rows.map(async (row) => ({
        ...row,
        onchainAllocationId: await this.resolveOnchainAllocationIdFromTxHash(row.allocationTxHash),
      })),
    );

    return withOnchainIds;
  }

  // -----------------------------------------------------------------------
  // ユーザーのクレーム履歴一覧を取得する
  // -----------------------------------------------------------------------
  async getClaims(input: { userId?: string; walletAddress?: string }) {
    const userId = await this.resolveUserId(input);
    if (!userId) return [];

    return this.prisma.revenueClaim.findMany({
      where: {
        revenueRight: { holderUserId: userId },
      },
      include: {
        allocation: true,
        revenueRight: true,
      },
      orderBy: { claimedAt: 'desc' },
    });
  }

  private toMarketStatus(row: { active: boolean; soldAt: Date | null; buyerUserId: string | null }): string {
    if (row.active) return 'ACTIVE';
    if (row.soldAt) return 'SOLD';
    if (row.buyerUserId) return 'SETTLING';
    return 'CANCELLED';
  }

  async listMarketListings(input?: {
    programId?: string;
    mineWalletAddress?: string;
    includeInactive?: boolean;
  }) {
    const mineUserId = input?.mineWalletAddress
      ? await this.resolveUserId({ walletAddress: input.mineWalletAddress })
      : null;

    const rows = await this.prisma.marketplaceListing.findMany({
      where: {
        listingType: 'REVENUE',
        ...(input?.includeInactive ? {} : { active: true }),
        ...(mineUserId
          ? {
              OR: [
                { sellerUserId: mineUserId },
                { buyerUserId: mineUserId },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
    if (rows.length === 0) return [];

    const rightIds = [...new Set(rows.map((row) => row.assetId))];
    const rights = await this.prisma.revenueRight.findMany({
      where: {
        id: { in: rightIds },
        ...(input?.programId ? { revenueProgramId: input.programId } : {}),
      },
      include: {
        revenueProgram: {
          include: {
            machine: {
              include: {
                venue: { select: { name: true } },
              },
            },
          },
        },
      },
    });
    const rightMap = new Map(rights.map((r) => [r.id, r]));
    const filtered = rows.filter((row) => rightMap.has(row.assetId));
    if (filtered.length === 0) return [];

    const userIds = [
      ...new Set(
        filtered
          .flatMap((row) => [row.sellerUserId, row.buyerUserId])
          .filter((id): id is string => !!id),
      ),
    ];
    const users = userIds.length > 0
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, walletAddress: true },
        })
      : [];
    const userWalletMap = new Map(users.map((u) => [u.id, u.walletAddress]));

    return filtered.map((row) => {
      const right = rightMap.get(row.assetId)!;
      const machine = right.revenueProgram.machine;
      return {
        id: row.id,
        listingType: row.listingType,
        status: this.toMarketStatus(row),
        active: row.active,
        priceJpyc: row.priceJpyc,
        expiryAt: row.expiryAt,
        soldAt: row.soldAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        sellerUserId: row.sellerUserId,
        sellerWalletAddress: userWalletMap.get(row.sellerUserId ?? '') ?? null,
        buyerUserId: row.buyerUserId,
        buyerWalletAddress: row.buyerUserId ? (userWalletMap.get(row.buyerUserId) ?? null) : null,
        revenueRight: {
          id: right.id,
          revenueProgramId: right.revenueProgramId,
          onchainProgramId: right.onchainTokenId,
          amount1155: right.amount1155,
          status: right.status,
          machineId: machine.id,
          nodeId: machine.machineId,
          machineName:
            machine.localSerial ??
            machine.gpu ??
            machine.cpu ??
            `Machine ${machine.machineId.slice(0, 8)}`,
          venueName: machine.venue?.name ?? 'Unknown Venue',
          settlementCycle: right.revenueProgram.settlementCycle,
          startAt: right.revenueProgram.startAt,
          endAt: right.revenueProgram.endAt,
        },
      };
    });
  }

  getMarketConfig() {
    const revenueRightAddress = process.env.REVENUE_RIGHT_ADDRESS?.trim() ?? null;
    const jpycTokenAddress = process.env.JPYC_TOKEN_ADDRESS?.trim() ?? null;
    let escrowWallet: string | null = null;
    try {
      escrowWallet = this.getRevenueEscrowWalletOrThrow();
    } catch {
      escrowWallet = null;
    }
    return {
      revenueRightAddress: revenueRightAddress && ethers.isAddress(revenueRightAddress)
        ? ethers.getAddress(revenueRightAddress)
        : null,
      jpycTokenAddress: jpycTokenAddress && ethers.isAddress(jpycTokenAddress)
        ? ethers.getAddress(jpycTokenAddress)
        : null,
      escrowWallet,
      chainEnabled: this.blockchain.isEnabled,
    };
  }

  async createMarketListing(input: {
    actorWalletAddress: string;
    onchainWalletAddress?: string;
    revenueRightId: string;
    priceJpyc: string;
    expiryAt?: Date;
    onchainTxHash: string;
  }) {
    const actorWallet = this.requireWalletAddress(input.actorWalletAddress, '認証ユーザー');
    const sellerWallet = input.onchainWalletAddress?.trim()
      ? this.requireWalletAddress(input.onchainWalletAddress, '出品者')
      : actorWallet;
    const sellerUserId = await this.resolveOrCreateUserIdByWallet(actorWallet);
    const priceJpyc = this.requirePositiveIntegerString(input.priceJpyc, '価格');
    const escrowWallet = this.getRevenueEscrowWalletOrThrow();

    const right = await this.prisma.revenueRight.findUnique({
      where: { id: input.revenueRightId },
      include: {
        revenueProgram: true,
      },
    });
    if (!right) {
      throw new HttpException(
        { message: '収益権が見つかりません' },
        HttpStatus.NOT_FOUND,
      );
    }
    if (right.holderUserId !== sellerUserId) {
      throw new HttpException(
        { message: 'この収益権を出品する権限がありません' },
        HttpStatus.FORBIDDEN,
      );
    }
    if (right.status !== 'ACTIVE') {
      throw new HttpException(
        { message: 'ACTIVE 状態の収益権のみ出品できます' },
        HttpStatus.CONFLICT,
      );
    }
    if (!right.onchainTokenId || !/^\d+$/.test(right.onchainTokenId)) {
      throw new HttpException(
        { message: 'オンチェーンProgram IDが未設定です' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const amount = this.parseAmount(right.amount1155);
    if (amount <= 0n) {
      throw new HttpException(
        { message: '出品可能な保有数量がありません' },
        HttpStatus.CONFLICT,
      );
    }
    const now = new Date();
    if (input.expiryAt && input.expiryAt <= now) {
      throw new HttpException(
        { message: 'expiryAt は現在時刻より後で指定してください' },
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.verifyRevenueTransferOrThrow({
      txHash: input.onchainTxHash,
      from: sellerWallet,
      to: escrowWallet,
      programId: right.onchainTokenId,
      amount: amount.toString(),
    });

    const listing = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.marketplaceListing.findFirst({
        where: {
          listingType: 'REVENUE',
          assetId: right.id,
          active: true,
        },
        select: { id: true },
      });
      if (existing) {
        throw new HttpException(
          { message: 'この収益権は既に出品中です' },
          HttpStatus.CONFLICT,
        );
      }

      const switched = await tx.revenueRight.updateMany({
        where: {
          id: right.id,
          holderUserId: sellerUserId,
          status: 'ACTIVE',
        },
        data: {
          holderUserId: null,
          status: 'LISTED',
        },
      });
      if (switched.count !== 1) {
        throw new HttpException(
          { message: '収益権状態の更新に失敗しました。再試行してください' },
          HttpStatus.CONFLICT,
        );
      }

      return tx.marketplaceListing.create({
        data: {
          listingType: 'REVENUE',
          assetId: right.id,
          sellerUserId,
          priceJpyc,
          expiryAt: input.expiryAt ?? null,
          active: true,
        },
      });
    });

    return {
      ...listing,
      status: this.toMarketStatus(listing),
      onchainTxHash: input.onchainTxHash,
    };
  }

  async cancelMarketListing(input: {
    listingId: string;
    actorWalletAddress: string;
    onchainWalletAddress?: string;
  }) {
    const actorWallet = this.requireWalletAddress(input.actorWalletAddress, '認証ユーザー');
    const sellerWallet = input.onchainWalletAddress?.trim()
      ? this.requireWalletAddress(input.onchainWalletAddress, '出品者')
      : actorWallet;
    const sellerUserId = await this.resolveOrCreateUserIdByWallet(actorWallet);

    const listing = await this.prisma.marketplaceListing.findUnique({
      where: { id: input.listingId },
    });
    if (!listing || listing.listingType !== 'REVENUE') {
      throw new HttpException(
        { message: '収益権出品が見つかりません' },
        HttpStatus.NOT_FOUND,
      );
    }
    if (listing.sellerUserId !== sellerUserId) {
      throw new HttpException(
        { message: 'この出品を取り下げる権限がありません' },
        HttpStatus.FORBIDDEN,
      );
    }
    if (!listing.active || listing.buyerUserId) {
      throw new HttpException(
        { message: '購入処理中または終了済みの出品は取り下げできません' },
        HttpStatus.CONFLICT,
      );
    }

    const right = await this.prisma.revenueRight.findUnique({ where: { id: listing.assetId } });
    if (!right) {
      throw new HttpException(
        { message: '収益権が見つかりません' },
        HttpStatus.NOT_FOUND,
      );
    }
    if (!right.onchainTokenId || !/^\d+$/.test(right.onchainTokenId)) {
      throw new HttpException(
        { message: 'オンチェーンProgram IDが未設定です' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const amount = this.parseAmount(right.amount1155);
    if (amount <= 0n) {
      throw new HttpException(
        { message: '取り下げ対象の数量が不正です' },
        HttpStatus.CONFLICT,
      );
    }

    const onchainTransfer = await this.revenueContract.transferFromEscrow({
      to: sellerWallet,
      programId: BigInt(right.onchainTokenId),
      amount,
    });
    if (!onchainTransfer) {
      throw new HttpException(
        { message: 'オンチェーン返却トランザクションの送信に失敗しました' },
        HttpStatus.BAD_GATEWAY,
      );
    }

    const cancelled = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.marketplaceListing.updateMany({
        where: {
          id: listing.id,
          listingType: 'REVENUE',
          active: true,
          buyerUserId: null,
        },
        data: {
          active: false,
        },
      });
      if (updated.count !== 1) {
        throw new HttpException(
          { message: '出品状態の更新に失敗しました。再試行してください' },
          HttpStatus.CONFLICT,
        );
      }

      const switched = await tx.revenueRight.updateMany({
        where: {
          id: right.id,
          status: 'LISTED',
        },
        data: {
          holderUserId: sellerUserId,
          status: 'ACTIVE',
        },
      });
      if (switched.count !== 1) {
        throw new HttpException(
          { message: '収益権状態の復元に失敗しました' },
          HttpStatus.CONFLICT,
        );
      }

      return tx.marketplaceListing.findUniqueOrThrow({ where: { id: listing.id } });
    });

    return {
      ...cancelled,
      status: this.toMarketStatus(cancelled),
      transferTxHash: onchainTransfer.txHash,
    };
  }

  async buyMarketListing(input: {
    listingId: string;
    actorWalletAddress: string;
    onchainWalletAddress?: string;
    onchainPaymentTxHash: string;
  }) {
    const actorWallet = this.requireWalletAddress(input.actorWalletAddress, '認証ユーザー');
    const buyerWallet = input.onchainWalletAddress?.trim()
      ? this.requireWalletAddress(input.onchainWalletAddress, '購入者')
      : actorWallet;
    const buyerUserId = await this.resolveOrCreateUserIdByWallet(actorWallet);

    const listing = await this.prisma.marketplaceListing.findUnique({
      where: { id: input.listingId },
    });
    if (!listing || listing.listingType !== 'REVENUE') {
      throw new HttpException(
        { message: '収益権出品が見つかりません' },
        HttpStatus.NOT_FOUND,
      );
    }
    if (!listing.active) {
      throw new HttpException(
        { message: 'この出品は購入できない状態です' },
        HttpStatus.CONFLICT,
      );
    }
    if (listing.expiryAt && listing.expiryAt <= new Date()) {
      throw new HttpException(
        { message: 'この出品は期限切れです' },
        HttpStatus.CONFLICT,
      );
    }
    if (!listing.sellerUserId) {
      throw new HttpException(
        { message: '出品者情報が不正です' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (listing.sellerUserId === buyerUserId) {
      throw new HttpException(
        { message: '自分の出品は購入できません' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const right = await this.prisma.revenueRight.findUnique({ where: { id: listing.assetId } });
    if (!right) {
      throw new HttpException(
        { message: '収益権が見つかりません' },
        HttpStatus.NOT_FOUND,
      );
    }
    if (!right.onchainTokenId || !/^\d+$/.test(right.onchainTokenId)) {
      throw new HttpException(
        { message: 'オンチェーンProgram IDが未設定です' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const amount = this.parseAmount(right.amount1155);
    if (amount <= 0n) {
      throw new HttpException(
        { message: '購入対象の数量が不正です' },
        HttpStatus.CONFLICT,
      );
    }

    const sellerWallet = await this.getUserWalletAddress(listing.sellerUserId, '出品者');
    await this.verifyJpycPaymentOrThrow({
      txHash: input.onchainPaymentTxHash,
      buyerWallet,
      sellerWallet,
      minAmount: listing.priceJpyc,
    });

    const lock = await this.prisma.marketplaceListing.updateMany({
      where: {
        id: listing.id,
        listingType: 'REVENUE',
        active: true,
        buyerUserId: null,
      },
      data: {
        active: false,
        buyerUserId,
      },
    });
    if (lock.count !== 1) {
      throw new HttpException(
        { message: '他の購入処理と競合しました。再読み込みして確認してください' },
        HttpStatus.CONFLICT,
      );
    }

    const onchainTransfer = await this.revenueContract.transferFromEscrow({
      to: buyerWallet,
      programId: BigInt(right.onchainTokenId),
      amount,
    });
    if (!onchainTransfer) {
      throw new HttpException(
        { message: '支払いは確認済みですが、収益権受渡のオンチェーン処理に失敗しました。再実行してください。' },
        HttpStatus.BAD_GATEWAY,
      );
    }

    const soldAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      const switched = await tx.revenueRight.updateMany({
        where: {
          id: right.id,
          status: 'LISTED',
        },
        data: {
          holderUserId: buyerUserId,
          status: 'ACTIVE',
        },
      });
      if (switched.count !== 1) {
        throw new HttpException(
          { message: '収益権の所有者更新に失敗しました。管理者へお問い合わせください。' },
          HttpStatus.CONFLICT,
        );
      }

      await tx.marketplaceListing.update({
        where: { id: listing.id },
        data: {
          soldAt,
          buyerUserId,
        },
      });
    });

    return {
      id: listing.id,
      status: 'SOLD',
      buyerUserId,
      soldAt,
      paymentTxHash: input.onchainPaymentTxHash,
      transferTxHash: onchainTransfer.txHash,
    };
  }

  async settlePendingMarketListing(input: {
    listingId: string;
    actorWalletAddress: string;
    onchainWalletAddress?: string;
  }) {
    const actorWallet = this.requireWalletAddress(input.actorWalletAddress, '認証ユーザー');
    const buyerWallet = input.onchainWalletAddress?.trim()
      ? this.requireWalletAddress(input.onchainWalletAddress, '購入者')
      : actorWallet;
    const buyerUserId = await this.resolveOrCreateUserIdByWallet(actorWallet);

    const listing = await this.prisma.marketplaceListing.findUnique({
      where: { id: input.listingId },
    });
    if (!listing || listing.listingType !== 'REVENUE') {
      throw new HttpException(
        { message: '収益権出品が見つかりません' },
        HttpStatus.NOT_FOUND,
      );
    }
    if (listing.buyerUserId !== buyerUserId) {
      throw new HttpException(
        { message: 'この購入処理を再実行する権限がありません' },
        HttpStatus.FORBIDDEN,
      );
    }
    if (listing.soldAt) {
      return {
        id: listing.id,
        status: 'SOLD',
        buyerUserId,
        soldAt: listing.soldAt,
        transferTxHash: null,
      };
    }

    const right = await this.prisma.revenueRight.findUnique({ where: { id: listing.assetId } });
    if (!right) {
      throw new HttpException(
        { message: '収益権が見つかりません' },
        HttpStatus.NOT_FOUND,
      );
    }
    if (!right.onchainTokenId || !/^\d+$/.test(right.onchainTokenId)) {
      throw new HttpException(
        { message: 'オンチェーンProgram IDが未設定です' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    let transferTxHash: string | null = null;
    if (!(right.holderUserId === buyerUserId && right.status === 'ACTIVE')) {
      const amount = this.parseAmount(right.amount1155);
      if (amount <= 0n) {
        throw new HttpException(
          { message: '受渡数量が不正です' },
          HttpStatus.CONFLICT,
        );
      }

      const onchainTransfer = await this.revenueContract.transferFromEscrow({
        to: buyerWallet,
        programId: BigInt(right.onchainTokenId),
        amount,
      });
      if (!onchainTransfer) {
        throw new HttpException(
          { message: '収益権受渡のオンチェーン処理に失敗しました。時間をおいて再実行してください。' },
          HttpStatus.BAD_GATEWAY,
        );
      }
      transferTxHash = onchainTransfer.txHash;
    }

    const soldAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.revenueRight.update({
        where: { id: right.id },
        data: {
          holderUserId: buyerUserId,
          status: 'ACTIVE',
        },
      });
      await tx.marketplaceListing.update({
        where: { id: listing.id },
        data: { soldAt },
      });
    });

    return {
      id: listing.id,
      status: 'SOLD',
      buyerUserId,
      soldAt,
      transferTxHash,
    };
  }

  // -----------------------------------------------------------------------
  // 配当をクレームする
  // 1. 収益権の所有者確認
  // 2. 重複クレームのチェック
  // 3. 按分計算してクレームレコードを作成する
  // -----------------------------------------------------------------------
  async claimRevenue(
    revenueRightId: string,
    allocationId: string,
    input: { userId?: string; walletAddress?: string; onchainWalletAddress?: string; onchainTxHash?: string },
  ) {
    const userId = await this.resolveUserId(input);
    if (!userId) {
      throw new HttpException(
        { message: 'ユーザーが見つかりません' },
        HttpStatus.NOT_FOUND,
      );
    }

    // 収益権の存在確認
    const revenueRight = await this.prisma.revenueRight.findUnique({
      where: { id: revenueRightId },
      include: { revenueProgram: true },
    });
    if (!revenueRight) {
      throw new HttpException(
        { message: '収益権が見つかりません' },
        HttpStatus.NOT_FOUND,
      );
    }

    // 所有者確認
    if (revenueRight.holderUserId !== userId) {
      throw new HttpException(
        { message: 'この収益権のクレーム権限がありません' },
        HttpStatus.FORBIDDEN,
      );
    }

    // アロケーションの存在確認
    const allocation = await this.prisma.revenueAllocation.findUnique({
      where: { id: allocationId },
    });
    if (!allocation) {
      throw new HttpException(
        { message: 'アロケーションが見つかりません' },
        HttpStatus.NOT_FOUND,
      );
    }
    if (allocation.revenueProgramId !== revenueRight.revenueProgramId) {
      throw new HttpException(
        { message: 'アロケーションと収益権のプログラムが一致しません' },
        HttpStatus.BAD_REQUEST,
      );
    }

    // 重複クレームチェック
    const existing = await this.prisma.revenueClaim.findFirst({
      where: { revenueRightId, allocationId },
    });
    if (existing) {
      throw new HttpException(
        { message: '既にクレーム済みです' },
        HttpStatus.CONFLICT,
      );
    }

    if (this.flags.strictOnchainModeEnabled() && !input.onchainTxHash) {
      throw new HttpException(
        { message: 'オンチェーントランザクション（onchainTxHash）が必須です' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const holderWallet = input.onchainWalletAddress?.trim()
      ? this.requireWalletAddress(input.onchainWalletAddress, '収益権保有者')
      : await this.getUserWalletAddress(userId, '収益権保有者');
    const expectedProgramId = revenueRight.onchainTokenId ?? null;
    if (this.flags.strictOnchainModeEnabled() && !expectedProgramId) {
      throw new HttpException(
        { message: 'オンチェーンProgram IDが未設定です' },
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const expectedAllocationId = await this.resolveOnchainAllocationIdFromTxHash(allocation.allocationTxHash);

    let claimedAmount = 0n;
    let claimTxHash: string | null = null;

    if (input.onchainTxHash) {
      const verified = await this.verifyClaimTxOrThrow({
        onchainTxHash: input.onchainTxHash,
        holderWallet,
        expectedProgramId,
        expectedAllocationId,
      });
      claimedAmount = BigInt(verified.claimedAmountJpyc);
      claimTxHash = input.onchainTxHash;
      this.logger.log(
        `[revenue.claim] verified onchain rightId=${revenueRightId} allocationId=${allocationId} txHash=${input.onchainTxHash} amount=${claimedAmount.toString()}`,
      );
    } else {
      // strict=false の場合のみフォールバック計算を許可する。
      const rightsInProgram = await this.prisma.revenueRight.findMany({
        where: { revenueProgramId: revenueRight.revenueProgramId },
        select: { amount1155: true },
      });
      const summed = rightsInProgram.reduce((acc, r) => {
        return acc + BigInt(r.amount1155 ?? '1');
      }, 0n);
      const totalSupply = summed > 0n ? summed : 1n;
      const rightAmount = BigInt(revenueRight.amount1155 ?? '1');
      const totalAmount = BigInt(allocation.totalAmountJpyc);
      claimedAmount = (totalAmount * rightAmount) / totalSupply;
      this.logger.warn(
        `[revenue.claim] onchainTxHash 未指定のためオフチェーン計算を使用 rightId=${revenueRightId} allocationId=${allocationId}`,
      );
    }

    // クレームレコードを作成する
    const claim = await this.prisma.revenueClaim.create({
      data: {
        revenueRightId,
        allocationId,
        claimedAmountJpyc: claimedAmount.toString(),
        claimTxHash,
      },
    });

    return claim;
  }
}
