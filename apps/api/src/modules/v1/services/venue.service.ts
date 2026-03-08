import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class VenueService implements OnModuleInit {
  private readonly logger = new Logger(VenueService.name);

  constructor(private readonly prisma: PrismaService) {}

  // 初回起動時にデモデータを投入（DBが空の場合のみ）
  async onModuleInit() {
    try {
      const count = await this.prisma.venue.count();
      if (count === 0) await this.seed();
    } catch (error) {
      this.logger.warn('DB に接続できないため初期シードをスキップします。API は継続起動します。');
      this.logger.debug(String(error));
    }
  }

  async listVenues() {
    return this.prisma.venue.findMany({
      select: {
        id: true,
        name: true,
        address: true,
        timezone: true,
        latitude: true,
        longitude: true,
        amenities: true,
        openHours: true,
        totalSeats: true,
        status: true,
      },
    });
  }

  async getVenue(venueId: string) {
    return this.prisma.venue.findUnique({ where: { id: venueId } });
  }

  async listUsageProductsByVenue(venueId: string) {
    return this.prisma.usageProduct.findMany({
      where: { venueId, status: 'ACTIVE' },
      select: {
        id: true,
        productName: true,
        durationMinutes: true,
        priceJpyc: true,
        usageType: true,
        transferable: true,
        maxTransferCount: true,
      },
    });
  }

  // -----------------------------------------------------------------------
  // シードデータ
  // -----------------------------------------------------------------------

  private async seed() {
    // デモユーザーを作成
    await this.prisma.user.upsert({
      where: { email: 'demo@nodestay.jp' },
      create: {
        email: 'demo@nodestay.jp',
        displayName: 'デモユーザー',
        status: 'ACTIVE',
      },
      update: {},
    });

    // デモマーチャントを作成
    const merchant = await this.prisma.merchant.create({
      data: {
        businessName: 'NodeStay デモ運営',
        kycStatus: 'VERIFIED',
      },
    });

    const venueSeeds = [
      { name: 'NodeCafe 渋谷センター', address: '東京都渋谷区宇田川町21-6', lat: 35.661, lng: 139.6983, amenities: ['Wi-Fi', 'GPU', '個室', 'ドリンクバー'], openHours: '24時間営業', totalSeats: 40 },
      { name: 'ComputeHub 道玄坂', address: '東京都渋谷区道玄坂2-10-12', lat: 35.6571, lng: 139.6967, amenities: ['Wi-Fi', 'GPU', 'ドリンクバー', 'シャワー'], openHours: '24時間営業', totalSeats: 25 },
      { name: 'サイレントスペース 神南', address: '東京都渋谷区神南1-12-16', lat: 35.6635, lng: 139.6993, amenities: ['Wi-Fi', '個室', '電源'], openHours: '07:00〜23:00', totalSeats: 15 },
      { name: 'NodeStation 原宿', address: '東京都渋谷区神宮前1-8-5', lat: 35.6702, lng: 139.7027, amenities: ['Wi-Fi', '電源', 'ドリンクバー'], openHours: '09:00〜22:00', totalSeats: 30 },
      { name: 'DeepWork 代官山', address: '東京都渋谷区代官山町17-6', lat: 35.6488, lng: 139.7034, amenities: ['Wi-Fi', '個室', '電源', 'カフェ'], openHours: '08:00〜22:00', totalSeats: 10 },
      { name: 'GPUラボ 恵比寿', address: '東京都渋谷区恵比寿南1-5-5', lat: 35.6467, lng: 139.7101, amenities: ['Wi-Fi', 'GPU', 'ドリンクバー', '電源'], openHours: '24時間営業', totalSeats: 20 },
      { name: 'ネットパーク 桜丘', address: '東京都渋谷区桜丘町22-14', lat: 35.6548, lng: 139.701, amenities: ['Wi-Fi', 'ドリンクバー', 'シャワー', 'コミック'], openHours: '24時間営業', totalSeats: 50 },
      { name: 'クリエイターズHQ 表参道', address: '東京都渋谷区神宮前4-9-2', lat: 35.6659, lng: 139.7093, amenities: ['Wi-Fi', 'GPU', '個室', 'カフェ', '電源'], openHours: '08:00〜23:00', totalSeats: 12 },
      { name: 'バジェットネット 神泉', address: '東京都渋谷区円山町5-3', lat: 35.6567, lng: 139.6926, amenities: ['Wi-Fi', '電源'], openHours: '10:00〜02:00', totalSeats: 35 },
      { name: 'NodeBase 代々木', address: '東京都渋谷区代々木1-30-1', lat: 35.6833, lng: 139.702, amenities: ['Wi-Fi', 'GPU', '電源', 'ドリンクバー'], openHours: '24時間営業', totalSeats: 28 },
    ];

    for (const [index, seed] of venueSeeds.entries()) {
      const venue = await this.prisma.venue.create({
        data: {
          merchantId: merchant.id,
          name: seed.name,
          address: seed.address,
          timezone: 'Asia/Tokyo',
          latitude: seed.lat,
          longitude: seed.lng,
          amenities: seed.amenities,
          openHours: seed.openHours,
          totalSeats: seed.totalSeats,
          status: 'ACTIVE',
        },
      });

      // デフォルトの使用権商品を作成
      await this.prisma.usageProduct.createMany({
        data: [
          { venueId: venue.id, productName: '1時間パック', durationMinutes: 60, priceJpyc: '500', usageType: 'PACK' },
          { venueId: venue.id, productName: '3時間パック', durationMinutes: 180, priceJpyc: '1200', usageType: 'PACK' },
          { venueId: venue.id, productName: 'ナイトパック', durationMinutes: 480, priceJpyc: '2000', usageType: 'NIGHT' },
        ],
      });

      // デモ算力ノード（machine + compute_product）を投入する
      const machine = await this.prisma.machine.create({
        data: {
          venueId: venue.id,
          machineId: `0x${(index + 1).toString(16).padStart(64, '0')}`,
          localSerial: `NODE-${String(index + 1).padStart(3, '0')}`,
          machineClass: index % 2 === 0 ? 'GPU' : 'CPU',
          cpu: index % 2 === 0 ? 'AMD Ryzen 9 7950X' : 'AMD EPYC 7642',
          gpu: index % 2 === 0 ? 'NVIDIA RTX 4090' : null,
          ramGb: index % 2 === 0 ? 64 : 128,
          storageGb: 2000,
          status: 'ACTIVE',
        },
      });

      await this.prisma.computeProduct.create({
        data: {
          machineId: machine.id,
          computeTier: index % 2 === 0 ? 'GPU_PREMIUM' : 'CPU_HIGH',
          startWindow: new Date(),
          endWindow: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          maxDurationMinutes: 24 * 60,
          preemptible: true,
          settlementPolicy: 'PRO_RATA',
          priceJpyc: index % 2 === 0 ? '3000' : '900',
          status: 'ACTIVE',
        },
      });
    }
  }
}
