import {
  Body,
  Controller,
  Delete,
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
import { CurrentUser, type AuthenticatedUser } from '../decorators/current-user.decorator';
import { Public } from '../decorators/public.decorator';

const ClaimBody = z.object({
  revenueRightId: z.string().min(1, '収益権IDは必須です'),
  allocationId:   z.string().min(1, 'アロケーションIDは必須です'),
  onchainTxHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).optional(),
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

const ApproveProgramBody = z.object({});

const IssueProgramBody = z.object({});
const MarketListingBody = z.object({
  revenueRightId: z.string().min(1, '収益権IDは必須です'),
  priceJpyc: z.string().regex(/^\d+$/, 'priceJpycは正の整数文字列で指定してください'),
  expiryAt: z.string().datetime().optional(),
  onchainTxHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'onchainTxHashの形式が不正です'),
});

const CancelMarketListingBody = z.object({});

const BuyMarketListingBody = z.object({
  onchainPaymentTxHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'onchainPaymentTxHashの形式が不正です'),
});

@Controller('/v1/revenue')
export class RevenueController {
  constructor(
    private readonly revenue: RevenueService,
    private readonly revenueAllocation: RevenueAllocationService,
  ) {}

  @Public()
  @Get('/programs')
  async listPrograms(@Query('machineId') machineId?: string) {
    return this.revenue.listPrograms(machineId);
  }

  @Post('/programs')
  async createProgram(@CurrentUser() _user: AuthenticatedUser, @Body() body: unknown) {
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

  @Post('/programs/:programId/approve')
  async approveProgram(
    @CurrentUser() user: AuthenticatedUser,
    @Param('programId') programId: string,
    @Body() body: unknown,
  ) {
    const parsed = ApproveProgramBody.safeParse(body ?? {});
    if (!parsed.success) {
      throw new HttpException(
        { message: '入力が不正です', errors: parsed.error.flatten().fieldErrors },
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.revenue.approveProgram(programId, { approverUserId: user.address });
  }

  @Post('/programs/:programId/issue')
  async issueProgram(
    @CurrentUser() user: AuthenticatedUser,
    @Param('programId') programId: string,
    @Body() body: unknown,
  ) {
    const parsed = IssueProgramBody.safeParse(body ?? {});
    if (!parsed.success) {
      throw new HttpException(
        { message: '入力が不正です', errors: parsed.error.flatten().fieldErrors },
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.revenue.issueProgram(programId, { operatorUserId: user.address });
  }

  @Public()
  @Get('/programs/:programId')
  async getProgram(@Param('programId') programId: string) {
    return this.revenue.getProgram(programId);
  }

  @Get('/my-rights')
  async listMyRights(@CurrentUser() user: AuthenticatedUser) {
    return this.revenue.listMyRights({ walletAddress: user.address });
  }

  @Get('/programs/:programId/allocations')
  async listAllocations(@Param('programId') programId: string) {
    return this.revenue.listAllocations(programId);
  }

  @Get('/claims')
  async getClaims(@CurrentUser() user: AuthenticatedUser) {
    return this.revenue.getClaims({ walletAddress: user.address });
  }

  @Public()
  @Get('/market/listings')
  async listMarketListings(
    @Query('programId') programId?: string,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.revenue.listMarketListings({
      programId,
      includeInactive: includeInactive === 'true',
    });
  }

  @Public()
  @Get('/market/config')
  async getMarketConfig() {
    return this.revenue.getMarketConfig();
  }

  @Get('/market/my-listings')
  async listMyMarketListings(@CurrentUser() user: AuthenticatedUser) {
    return this.revenue.listMarketListings({
      mineWalletAddress: user.address,
      includeInactive: true,
    });
  }

  @Post('/market/listings')
  async createMarketListing(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const parsed = MarketListingBody.safeParse(body);
    if (!parsed.success) {
      throw new HttpException(
        { message: '入力が不正です', errors: parsed.error.flatten().fieldErrors },
        HttpStatus.BAD_REQUEST,
      );
    }
    const expiryAt = parsed.data.expiryAt ? new Date(parsed.data.expiryAt) : undefined;
    if (expiryAt && Number.isNaN(expiryAt.getTime())) {
      throw new HttpException(
        { message: 'expiryAt は有効な ISO8601 日時である必要があります' },
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.revenue.createMarketListing({
      walletAddress: user.address,
      revenueRightId: parsed.data.revenueRightId,
      priceJpyc: parsed.data.priceJpyc,
      expiryAt,
      onchainTxHash: parsed.data.onchainTxHash,
    });
  }

  @Delete('/market/listings/:listingId')
  async cancelMarketListing(
    @CurrentUser() user: AuthenticatedUser,
    @Param('listingId') listingId: string,
    @Body() body: unknown,
  ) {
    const parsed = CancelMarketListingBody.safeParse(body ?? {});
    if (!parsed.success) {
      throw new HttpException(
        { message: '入力が不正です', errors: parsed.error.flatten().fieldErrors },
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.revenue.cancelMarketListing({
      listingId,
      walletAddress: user.address,
    });
  }

  @Post('/market/listings/:listingId/buy')
  async buyMarketListing(
    @CurrentUser() user: AuthenticatedUser,
    @Param('listingId') listingId: string,
    @Body() body: unknown,
  ) {
    const parsed = BuyMarketListingBody.safeParse(body ?? {});
    if (!parsed.success) {
      throw new HttpException(
        { message: '入力が不正です', errors: parsed.error.flatten().fieldErrors },
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.revenue.buyMarketListing({
      listingId,
      walletAddress: user.address,
      onchainPaymentTxHash: parsed.data.onchainPaymentTxHash,
    });
  }

  @Post('/market/listings/:listingId/settle')
  async settleMarketListing(
    @CurrentUser() user: AuthenticatedUser,
    @Param('listingId') listingId: string,
  ) {
    return this.revenue.settlePendingMarketListing({
      listingId,
      walletAddress: user.address,
    });
  }

  @Post('/claim')
  async claimRevenue(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
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
      { walletAddress: user.address, onchainTxHash: parsed.data.onchainTxHash },
    );
  }

  @Post('/allocations/batch')
  async runAllocationBatch(@CurrentUser() _user: AuthenticatedUser, @Body() body: unknown) {
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
