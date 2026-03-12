import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { RevenueService } from '../services/revenue.service';
import { RevenueAllocationService } from '../services/revenue-allocation.service';
import { Public } from '../decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../decorators/current-user.decorator';
import { UserService } from '../services/user.service';

// -----------------------------------------------------------------------
// クレームリクエストのバリデーションスキーマ
// -----------------------------------------------------------------------
const ClaimBody = z.object({
  revenueRightId: z.string().min(1, '収益権IDは必須です'),
  allocationId:   z.string().min(1, 'アロケーションIDは必須です'),
  userId:         z.string().min(1, 'ユーザーIDは必須です').optional(),
  walletAddress:  z.string().regex(/^0x[0-9a-fA-F]{40}$/).optional(),
}).refine((v) => Boolean(v.userId || v.walletAddress), {
  message: 'userId または walletAddress のいずれかが必要です',
  path: ['userId'],
});

const BatchAllocateBody = z.object({
  programId: z.string().min(1).optional(),
  nowIso: z.string().datetime().optional(),
  dryRun: z.boolean().optional(),
});

const CreateProgramBody = z.object({
  merchantId: z.string().min(1),
  machineId: z.string().min(1),
  shareBps: z.number().int().min(1).max(4000),
  revenueScope: z.enum(['USAGE_ONLY', 'COMPUTE_ONLY', 'ALL']),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  settlementCycle: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
  payoutToken: z.string().optional(),
  metadataUri: z.string().optional(),
  investors: z.array(z.object({
    holderUserId: z.string().min(1),
    amount1155: z.string().regex(/^\d+$/),
  })).min(1),
});

const ApproveProgramBody = z.object({
  approverUserId: z.string().min(1).optional(),
});

const IssueProgramBody = z.object({
  operatorUserId: z.string().min(1).optional(),
});

// -----------------------------------------------------------------------
// 収益プログラムコントローラー
// RevenueProgram / RevenueRight / RevenueAllocation / RevenueClaim を
// REST API として公開する
// -----------------------------------------------------------------------
@Controller('/v1/revenue')
export class RevenueController {
  constructor(
    private readonly revenue: RevenueService,
    private readonly revenueAllocation: RevenueAllocationService,
    private readonly userService: UserService,
  ) {}

  // -----------------------------------------------------------------------
  // GET /v1/revenue/programs — 収益プログラム一覧を取得する（公開）
  // クエリパラメータ: machineId?
  // -----------------------------------------------------------------------
  @Public()
  @Get('/programs')
  async listPrograms(@Query('machineId') machineId?: string) {
    return this.revenue.listPrograms(machineId);
  }

  // -----------------------------------------------------------------------
  // POST /v1/revenue/programs — 収益プログラム草稿を作成する（Merchant）
  // -----------------------------------------------------------------------
  @Post('/programs')
  async createProgram(@Body() body: unknown) {
    const parsed = CreateProgramBody.safeParse(body);
    if (!parsed.success) {
      throw new HttpException(
        { message: '入力が不正です', errors: parsed.error.flatten().fieldErrors },
        HttpStatus.BAD_REQUEST,
      );
    }

    const startAt = new Date(parsed.data.startAt);
    const endAt = new Date(parsed.data.endAt);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      throw new HttpException({ message: 'startAt / endAt は有効な ISO8601 日時である必要があります' }, HttpStatus.BAD_REQUEST);
    }

    return this.revenue.createProgramDraft({
      merchantId: parsed.data.merchantId,
      machineId: parsed.data.machineId,
      shareBps: parsed.data.shareBps,
      revenueScope: parsed.data.revenueScope,
      startAt,
      endAt,
      settlementCycle: parsed.data.settlementCycle,
      payoutToken: parsed.data.payoutToken,
      metadataUri: parsed.data.metadataUri,
      investors: parsed.data.investors,
    });
  }

  // -----------------------------------------------------------------------
  // POST /v1/revenue/programs/:programId/approve — 収益プログラムを承認する（Admin/Risk）
  // -----------------------------------------------------------------------
  @Post('/programs/:programId/approve')
  async approveProgram(@Param('programId') programId: string, @Body() body: unknown) {
    const parsed = ApproveProgramBody.safeParse(body ?? {});
    if (!parsed.success) {
      throw new HttpException(
        { message: '入力が不正です', errors: parsed.error.flatten().fieldErrors },
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.revenue.approveProgram(programId, parsed.data);
  }

  // -----------------------------------------------------------------------
  // POST /v1/revenue/programs/:programId/issue — 収益権をオンチェーン発行する（Operator）
  // -----------------------------------------------------------------------
  @Post('/programs/:programId/issue')
  async issueProgram(@Param('programId') programId: string, @Body() body: unknown) {
    const parsed = IssueProgramBody.safeParse(body ?? {});
    if (!parsed.success) {
      throw new HttpException(
        { message: '入力が不正です', errors: parsed.error.flatten().fieldErrors },
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.revenue.issueProgram(programId, parsed.data);
  }

  // -----------------------------------------------------------------------
  // GET /v1/revenue/programs/:programId — 収益プログラム詳細を取得する（公開）
  // -----------------------------------------------------------------------
  @Public()
  @Get('/programs/:programId')
  async getProgram(@Param('programId') programId: string) {
    return this.revenue.getProgram(programId);
  }

  // -----------------------------------------------------------------------
  // GET /v1/revenue/my-rights?userId=xxx — ユーザーの収益権一覧を取得する
  // -----------------------------------------------------------------------
  @Get('/my-rights')
  async listMyRights(
    @Query('userId') userId?: string,
    @Query('walletAddress') walletAddress?: string,
  ) {
    if (!userId && !walletAddress) {
      throw new HttpException(
        { message: 'userId または walletAddress は必須パラメータです' },
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.revenue.listMyRights({ userId, walletAddress });
  }

  // -----------------------------------------------------------------------
  // GET /v1/revenue/programs/:programId/allocations（公開）
  // 指定プログラムのアロケーション一覧を取得する
  // -----------------------------------------------------------------------
  @Public()
  @Get('/programs/:programId/allocations')
  async listAllocations(@Param('programId') programId: string) {
    return this.revenue.listAllocations(programId);
  }

  // -----------------------------------------------------------------------
  // GET /v1/revenue/claims?userId=xxx — ユーザーのクレーム履歴を取得する
  // -----------------------------------------------------------------------
  @Get('/claims')
  async getClaims(
    @Query('userId') userId?: string,
    @Query('walletAddress') walletAddress?: string,
  ) {
    if (!userId && !walletAddress) {
      throw new HttpException(
        { message: 'userId または walletAddress は必須パラメータです' },
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.revenue.getClaims({ userId, walletAddress });
  }

  // -----------------------------------------------------------------------
  // POST /v1/revenue/claim — 配当をクレームする
  // ボディ: { revenueRightId, allocationId, userId }
  // -----------------------------------------------------------------------
  @Post('/claim')
  async claimRevenue(@Body() body: unknown) {
    const parsed = ClaimBody.safeParse(body);
    if (!parsed.success) {
      throw new HttpException(
        { message: '入力が不正です', errors: parsed.error.flatten().fieldErrors },
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.revenue.claimRevenue(
      parsed.data.revenueRightId,
      parsed.data.allocationId,
      {
        userId: parsed.data.userId,
        walletAddress: parsed.data.walletAddress,
      },
    );
  }

  // -----------------------------------------------------------------------
  // POST /v1/revenue/allocations/batch — 配当アロケーションバッチを実行する
  // ボディ: { programId?, nowIso?, dryRun? }
  // -----------------------------------------------------------------------
  @Post('/allocations/batch')
  async runAllocationBatch(@Body() body: unknown) {
    const parsed = BatchAllocateBody.safeParse(body ?? {});
    if (!parsed.success) {
      throw new HttpException(
        { message: '入力が不正です', errors: parsed.error.flatten().fieldErrors },
        HttpStatus.BAD_REQUEST,
      );
    }

    const now = parsed.data.nowIso ? new Date(parsed.data.nowIso) : undefined;
    if (now && Number.isNaN(now.getTime())) {
      throw new HttpException(
        { message: 'nowIso は有効な ISO8601 日時である必要があります' },
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.revenueAllocation.runBatch({
      programId: parsed.data.programId,
      now,
      dryRun: parsed.data.dryRun,
    });
  }
}
