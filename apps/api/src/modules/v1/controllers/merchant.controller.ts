import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { ethers } from 'ethers';
import { PrismaService } from '../../../prisma/prisma.service';
import { VenueService } from '../services/venue.service';
import { CurrentUser, type AuthenticatedUser } from '../decorators/current-user.decorator';
import { UserService } from '../services/user.service';
import { ComputeService } from '../services/compute.service';

const CreateVenueBody = z.object({
  merchantId: z.string().min(1).optional(),
  name: z.string().min(1),
  address: z.string().optional(),
  city: z.string().optional(),
  prefecture: z.string().optional(),
  timezone: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  amenities: z.array(z.string()).optional(),
  openHours: z.string().optional(),
  totalSeats: z.number().int().min(0).optional(),
});

const UpsertProductBody = z.object({
  productName: z.string().min(1),
  usageType: z.enum(['HOURLY', 'PACK', 'NIGHT', 'FLEX']),
  durationMinutes: z.number().int().min(1),
  priceJpyc: z.string().min(1),
  transferable: z.boolean().optional(),
  maxTransferCount: z.number().int().min(0).optional(),
});

const CreateDisputeBody = z.object({
  referenceType: z.string().min(1),
  referenceId: z.string().min(1),
});

const EnableComputeBody = z.object({
  enable: z.boolean().default(true),
});

const TreasuryWalletBody = z.object({
  treasuryWallet: z.string().min(1),
});

const MerchantComputeWindow = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
});

const UpsertMerchantComputeNodeBody = z.object({
  enabled: z.boolean(),
  pricePerHourMinor: z.number().int().min(1),
  minBookingHours: z.number().int().min(1).max(24),
  maxBookingHours: z.number().int().min(1).max(24),
  supportedTasks: z.array(z.string()).min(1),
  availableWindows: z.array(MerchantComputeWindow),
});

@Controller('/v1/merchant')
export class MerchantController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly venueService: VenueService,
    private readonly userService: UserService,
    private readonly computeService: ComputeService,
  ) {}

  @Get('/venues')
  async listMyVenues(@CurrentUser() user: AuthenticatedUser) {
    const me = await this.prisma.user.findFirst({
      where: {
        walletAddress: {
          equals: user.address,
          mode: 'insensitive',
        },
      },
      select: { id: true },
    });
    if (!me) return [];

    const merchants = await this.prisma.merchant.findMany({
      where: { ownerUserId: me.id },
      select: { id: true },
    });
    if (merchants.length === 0) return [];

    return this.prisma.venue.findMany({
      where: {
        merchantId: { in: merchants.map((m) => m.id) },
        status: 'ACTIVE',
      },
      select: {
        id: true,
        merchantId: true,
        name: true,
        address: true,
        timezone: true,
        latitude: true,
        longitude: true,
        totalSeats: true,
        status: true,
        merchant: {
          select: {
            treasuryWallet: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  @Get('/venues/:venueId/treasury-wallet')
  async getVenueTreasuryWallet(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
  ) {
    const actingUserId = await this.userService.findOrCreateByWallet(user.address);
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: {
        id: true,
        merchant: {
          select: {
            id: true,
            ownerUserId: true,
            treasuryWallet: true,
          },
        },
      },
    });
    if (!venue) {
      throw new HttpException({ message: '店舗が見つかりません' }, HttpStatus.NOT_FOUND);
    }
    const merchant = venue.merchant;
    if (merchant.ownerUserId && merchant.ownerUserId !== actingUserId) {
      throw new HttpException({ message: 'この店舗の設定を参照する権限がありません' }, HttpStatus.FORBIDDEN);
    }

    return {
      venueId: venue.id,
      merchantId: merchant.id,
      ownerUserId: merchant.ownerUserId,
      treasuryWallet: merchant.treasuryWallet,
    };
  }

  @Put('/venues/:venueId/treasury-wallet')
  async upsertVenueTreasuryWallet(
    @CurrentUser() user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Body() body: unknown,
  ) {
    const parsed = TreasuryWalletBody.safeParse(body);
    if (!parsed.success) {
      throw new HttpException({ message: '入力が不正です' }, HttpStatus.BAD_REQUEST);
    }
    const rawWallet = parsed.data.treasuryWallet.trim();
    if (!ethers.isAddress(rawWallet) || rawWallet === ethers.ZeroAddress) {
      throw new HttpException({ message: 'ウォレットアドレス形式が不正です' }, HttpStatus.BAD_REQUEST);
    }
    const normalizedWallet = ethers.getAddress(rawWallet);

    const actingUserId = await this.userService.findOrCreateByWallet(user.address);
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: {
        id: true,
        merchant: {
          select: {
            id: true,
            ownerUserId: true,
          },
        },
      },
    });
    if (!venue) {
      throw new HttpException({ message: '店舗が見つかりません' }, HttpStatus.NOT_FOUND);
    }
    const merchant = venue.merchant;
    if (merchant.ownerUserId && merchant.ownerUserId !== actingUserId) {
      throw new HttpException({ message: 'この店舗の設定を更新する権限がありません' }, HttpStatus.FORBIDDEN);
    }

    const updated = await this.prisma.merchant.update({
      where: { id: merchant.id },
      data: {
        treasuryWallet: normalizedWallet,
        ownerUserId: merchant.ownerUserId ?? actingUserId,
      },
      select: {
        id: true,
        ownerUserId: true,
        treasuryWallet: true,
      },
    });

    return {
      venueId: venue.id,
      merchantId: updated.id,
      ownerUserId: updated.ownerUserId,
      treasuryWallet: updated.treasuryWallet,
    };
  }

  @Post('/venues')
  async createVenue(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown) {
    const parsed = CreateVenueBody.safeParse(body);
    if (!parsed.success) throw new HttpException({ message: '入力が不正です' }, HttpStatus.BAD_REQUEST);

    const actingUserId = await this.userService.findOrCreateByWallet(user.address);
    let merchantId = parsed.data.merchantId;

    // merchantId が未指定なら、ログイン中ユーザーの加盟店を自動解決する
    if (!merchantId) {
      const myMerchant = await this.prisma.merchant.findFirst({
        where: { ownerUserId: actingUserId },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });

      if (myMerchant) {
        merchantId = myMerchant.id;
      } else {
        const createdMerchant = await this.prisma.merchant.create({
          data: {
            ownerUserId: actingUserId,
            name: parsed.data.name,
            status: 'ACTIVE',
          },
          select: { id: true },
        });
        merchantId = createdMerchant.id;
      }
    } else {
      // merchantId 指定時はオーナー整合性を確認し、不正な紐付け作成を防止する
      const target = await this.prisma.merchant.findUnique({
        where: { id: merchantId },
        select: { id: true, ownerUserId: true },
      });
      if (!target) {
        throw new HttpException({ message: '加盟店が見つかりません' }, HttpStatus.NOT_FOUND);
      }
      if (target.ownerUserId && target.ownerUserId !== actingUserId) {
        throw new HttpException({ message: 'この加盟店に店舗を作成する権限がありません' }, HttpStatus.FORBIDDEN);
      }
      if (!target.ownerUserId) {
        await this.prisma.merchant.update({
          where: { id: target.id },
          data: { ownerUserId: actingUserId },
        });
      }
    }

    const venue = await this.prisma.venue.create({
      data: {
        merchantId,
        name: parsed.data.name,
        address: parsed.data.address,
        city: parsed.data.city,
        prefecture: parsed.data.prefecture,
        timezone: parsed.data.timezone ?? 'Asia/Tokyo',
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
        amenities: parsed.data.amenities ?? [],
        openHours: parsed.data.openHours,
        totalSeats: parsed.data.totalSeats ?? 0,
      },
    });

    return {
      venueId: venue.id,
      name: venue.name,
      address: venue.address ?? '',
      timezone: venue.timezone,
    };
  }

  @Put('/venues/:venueId/products')
  async upsertProduct(
    @CurrentUser() _user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Body() body: unknown,
  ) {
    const parsed = UpsertProductBody.safeParse(body);
    if (!parsed.success) throw new HttpException({ message: '入力が不正です' }, HttpStatus.BAD_REQUEST);

    const product = await this.prisma.usageProduct.create({
      data: {
        venueId,
        productName: parsed.data.productName,
        usageType: parsed.data.usageType,
        durationMinutes: parsed.data.durationMinutes,
        priceJpyc: parsed.data.priceJpyc,
        transferable: parsed.data.transferable ?? true,
        maxTransferCount: parsed.data.maxTransferCount ?? 1,
      },
    });

    return { productId: product.id };
  }

  @Post('/venues/:venueId/compute/enable')
  async enableCompute(
    @CurrentUser() _user: AuthenticatedUser,
    @Param('venueId') venueId: string,
    @Body() body: unknown,
  ) {
    const parsed = EnableComputeBody.safeParse(body);
    if (!parsed.success) {
      throw new HttpException({ message: '入力が不正です' }, HttpStatus.BAD_REQUEST);
    }

    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: { id: true },
    });
    if (!venue) {
      throw new HttpException({ message: '店舗が見つかりません' }, HttpStatus.NOT_FOUND);
    }

    // compute 一括有効化/停止は機械ステータスで管理する
    const nextStatus = parsed.data.enable ? 'ACTIVE' : 'REGISTERED';
    await this.prisma.machine.updateMany({
      where: { venueId },
      data: { status: nextStatus },
    });

    return {
      venueId,
      computeEnabled: parsed.data.enable,
    };
  }

  @Get('/compute/nodes')
  async listMerchantComputeNodes(
    @CurrentUser() user: AuthenticatedUser,
    @Query('venueId') venueId?: string,
  ) {
    return this.computeService.listMerchantNodes({
      actorWalletAddress: user.address,
      venueId,
    });
  }

  @Put('/compute/nodes/:machineId')
  async upsertMerchantComputeNode(
    @CurrentUser() user: AuthenticatedUser,
    @Param('machineId') machineId: string,
    @Body() body: unknown,
  ) {
    const parsed = UpsertMerchantComputeNodeBody.safeParse(body);
    if (!parsed.success) {
      throw new HttpException({ message: '入力が不正です' }, HttpStatus.BAD_REQUEST);
    }

    return this.computeService.upsertMerchantNodeConfig({
      actorWalletAddress: user.address,
      machineId,
      enabled: parsed.data.enabled,
      pricePerHourMinor: parsed.data.pricePerHourMinor,
      minBookingHours: parsed.data.minBookingHours,
      maxBookingHours: parsed.data.maxBookingHours,
      supportedTasks: parsed.data.supportedTasks,
      availableWindows: parsed.data.availableWindows,
    });
  }

  @Delete('/compute/nodes/:machineId')
  async removeMerchantComputeNode(
    @CurrentUser() user: AuthenticatedUser,
    @Param('machineId') machineId: string,
  ) {
    return this.computeService.removeMerchantNode({
      actorWalletAddress: user.address,
      machineId,
    });
  }

  @Post('/disputes')
  async createDispute(@CurrentUser() _user: AuthenticatedUser, @Body() body: unknown) {
    const parsed = CreateDisputeBody.safeParse(body);
    if (!parsed.success) throw new HttpException({ message: '入力が不正です' }, HttpStatus.BAD_REQUEST);

    const dispute = await this.prisma.dispute.create({
      data: {
        referenceType: parsed.data.referenceType,
        referenceId: parsed.data.referenceId,
        openerUserId: null,
      },
    });

    return { disputeId: dispute.id };
  }
}
