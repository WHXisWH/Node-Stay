import { Body, Controller, HttpException, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../../prisma/prisma.service';
import { VenueService } from '../services/venue.service';

const CreateVenueBody = z.object({
  merchantId: z.string().min(1),
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
  openerUserId: z.string().optional(),
});

@Controller('/v1/merchant')
export class MerchantController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly venueService: VenueService,
  ) {}

  @Post('/venues')
  async createVenue(@Body() body: unknown) {
    const parsed = CreateVenueBody.safeParse(body);
    if (!parsed.success) throw new HttpException({ message: '入力が不正です' }, HttpStatus.BAD_REQUEST);

    const venue = await this.prisma.venue.create({
      data: {
        merchantId: parsed.data.merchantId,
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

    return { venueId: venue.id };
  }

  @Put('/venues/:venueId/products')
  async upsertProduct(@Param('venueId') venueId: string, @Body() body: unknown) {
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

  @Post('/disputes')
  async createDispute(@Body() body: unknown) {
    const parsed = CreateDisputeBody.safeParse(body);
    if (!parsed.success) throw new HttpException({ message: '入力が不正です' }, HttpStatus.BAD_REQUEST);

    const dispute = await this.prisma.dispute.create({
      data: {
        referenceType: parsed.data.referenceType,
        referenceId: parsed.data.referenceId,
        openerUserId: parsed.data.openerUserId ?? null,
      },
    });

    return { disputeId: dispute.id };
  }
}
