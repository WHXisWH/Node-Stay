import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { MachineRegistryContractService } from '../../../blockchain/machine-registry.contract.service';
import crypto from 'node:crypto';
import { FeatureFlagsService } from './featureFlags.service';

// MachineClass 文字列 → enum インデックスのマップ（コントラクトの MachineClass enum と対応）
const MACHINE_CLASS_INDEX: Record<string, number> = {
  GPU:      1,
  CPU:      2,
  STANDARD: 0,
  PREMIUM:  3,
};

@Injectable()
export class MachineService {
  private readonly logger = new Logger(MachineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registryContract: MachineRegistryContractService,
    private readonly flags: FeatureFlagsService,
  ) {}

  // -----------------------------------------------------------------------
  // Machine CRUD
  // -----------------------------------------------------------------------

  async register(input: {
    venueId: string;
    machineClass: string;
    cpu?: string;
    gpu?: string;
    ramGb?: number;
    storageGb?: number;
    localSerial?: string;
    ownerWallet?: string;
    metadataUri?: string;
  }) {
    // まずオンチェーン登録し、成功した場合のみ DB に確定登録する。
    // strict モードでは失敗時に即エラーを返し、未上鎖の疑似データを残さない。
    const venueIdHash = '0x' + crypto.createHash('sha256').update(input.venueId).digest('hex');
    const specHash = '0x' + crypto.createHash('sha256')
      .update(`${input.machineClass}:${input.cpu ?? ''}:${input.gpu ?? ''}:${input.ramGb ?? 0}`)
      .digest('hex');

    const onchain = await this.registryContract.registerMachine({
      venueIdHash,
      machineClass: MACHINE_CLASS_INDEX[input.machineClass] ?? 0,
      specHash,
      metadataUri: input.metadataUri ?? '',
    });

    if (!onchain && this.flags.strictOnchainModeEnabled()) {
      throw new HttpException(
        { message: 'マシンのオンチェーン登録に失敗しました' },
        HttpStatus.BAD_GATEWAY,
      );
    }

    const seed = `${input.venueId}:${input.machineClass}:${input.localSerial ?? ''}:${Date.now()}`;
    const fallbackMachineId = '0x' + crypto.createHash('sha256').update(seed).digest('hex');
    if (!onchain) {
      this.logger.warn('[machine.register] strict=false のためオフチェーン登録として保存します');
    } else {
      this.logger.log(
        `オンチェーン登録成功: machineId=${onchain.machineId} tokenId=${onchain.tokenId} txHash=${onchain.txHash}`,
      );
    }

    return this.prisma.machine.create({
      data: {
        venueId: input.venueId,
        machineId: onchain?.machineId ?? fallbackMachineId,
        machineClass: input.machineClass,
        cpu: input.cpu ?? null,
        gpu: input.gpu ?? null,
        ramGb: input.ramGb ?? null,
        storageGb: input.storageGb ?? null,
        localSerial: input.localSerial ?? null,
        ownerWallet: input.ownerWallet ?? null,
        metadataUri: input.metadataUri ?? null,
        status: onchain ? 'ACTIVE' : 'REGISTERED',
        onchainTokenId: onchain?.tokenId ?? null,
        onchainTxHash: onchain?.txHash ?? null,
      },
    });
  }

  async list(filter: { venueId?: string; status?: string }) {
    return this.prisma.machine.findMany({
      where: {
        ...(filter.venueId ? { venueId: filter.venueId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
      },
      select: {
        id: true,
        machineId: true,
        venueId: true,
        machineClass: true,
        localSerial: true,
        cpu: true,
        gpu: true,
        ramGb: true,
        storageGb: true,
        status: true,
        onchainTokenId: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(id: string) {
    return this.prisma.machine.findUnique({
      where: { id },
      include: { venue: { select: { name: true } } },
    });
  }

  async updateStatus(id: string, status: string) {
    const valid = ['REGISTERED', 'ACTIVE', 'PAUSED', 'MAINTENANCE', 'DECOMMISSIONED'];
    if (!valid.includes(status)) return null;

    return this.prisma.machine.update({
      where: { id },
      data: { status },
    });
  }

  // -----------------------------------------------------------------------
  // MachineSlot 管理（二重売り防護）
  // -----------------------------------------------------------------------

  async getSlots(machineId: string, from: Date, to: Date) {
    return this.prisma.machineSlot.findMany({
      where: {
        machine: { id: machineId },
        slotStart: { gte: from },
        slotEnd: { lte: to },
      },
      orderBy: { slotStart: 'asc' },
    });
  }

  /**
   * スロット予約 — 重複チェック付きトランザクション（双売り防護）
   * 対象時間帯に既存の OCCUPIED スロットがあれば CONFLICT 例外を投げる
   */
  async reserveSlot(input: {
    machineId: string;       // machine.id（DBプライマリキー UUID）
    slotStart: Date;
    slotEnd: Date;
    slotType: 'USAGE' | 'COMPUTE';
    referenceType: string;
    referenceId: string;
  }): Promise<{ slotId: string }> {
    return this.prisma.$transaction(async (tx) => {
      // 同マシン・同時間帯に OCCUPIED スロットが存在しないか確認
      const conflict = await tx.machineSlot.findFirst({
        where: {
          machineId: input.machineId,
          occupancyStatus: 'OCCUPIED',
          slotStart: { lt: input.slotEnd },
          slotEnd:   { gt: input.slotStart },
        },
      });

      // 重複が見つかった場合は HTTP 409 Conflict を返す
      if (conflict) {
        throw new HttpException(
          { message: '指定時間帯はすでに予約済みです' },
          HttpStatus.CONFLICT,
        );
      }

      // 重複なし → スロットを新規作成
      const created = await tx.machineSlot.create({
        data: {
          machineId:       input.machineId,
          slotStart:       input.slotStart,
          slotEnd:         input.slotEnd,
          slotType:        input.slotType,
          occupancyStatus: 'OCCUPIED',
          referenceType:   input.referenceType,
          referenceId:     input.referenceId,
        },
      });

      return { slotId: created.id };
    });
  }

  /**
   * スロット解放 — referenceId に紐づくスロットを AVAILABLE に戻す
   */
  async releaseSlot(referenceId: string): Promise<void> {
    await this.prisma.machineSlot.updateMany({
      where: { referenceId },
      data:  { occupancyStatus: 'AVAILABLE' },
    });
  }

  async consumeSlot(slotId: string) {
    return this.prisma.machineSlot.update({
      where: { id: slotId },
      data: { occupancyStatus: 'CONSUMED' },
    });
  }
}
