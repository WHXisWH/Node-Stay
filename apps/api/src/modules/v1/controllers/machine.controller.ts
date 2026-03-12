import { Body, Controller, Get, HttpException, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { MachineService } from '../services/machine.service';
import { Public } from '../decorators/public.decorator';

const RegisterBody = z.object({
  venueId:      z.string().min(1),
  machineClass: z.enum(['GPU', 'CPU', 'STANDARD', 'PREMIUM']),
  cpu:          z.string().optional(),
  gpu:          z.string().optional(),
  ramGb:        z.number().int().positive().optional(),
  storageGb:    z.number().int().positive().optional(),
  localSerial:  z.string().optional(),
  ownerWallet:  z.string().optional(),
  metadataUri:  z.string().optional(),
});

const UpdateStatusBody = z.object({
  status: z.enum(['REGISTERED', 'ACTIVE', 'PAUSED', 'MAINTENANCE', 'DECOMMISSIONED']),
});

@Controller('/v1/machines')
export class MachineController {
  constructor(private readonly machine: MachineService) {}

  // POST /v1/machines — 機器登録
  @Post()
  async register(@Body() body: unknown) {
    const parsed = RegisterBody.safeParse(body);
    if (!parsed.success) throw new HttpException({ message: '入力が不正です' }, HttpStatus.BAD_REQUEST);

    const m = await this.machine.register(parsed.data);
    return { machineId: m.id, onchainMachineId: m.machineId, status: m.status };
  }

  // GET /v1/machines?venueId=xxx&status=ACTIVE（公開）
  @Public()
  @Get()
  async list(@Query('venueId') venueId?: string, @Query('status') status?: string) {
    return this.machine.list({ venueId, status });
  }

  // GET /v1/machines/:id（公開）
  @Public()
  @Get('/:id')
  async get(@Param('id') id: string) {
    const m = await this.machine.get(id);
    if (!m) throw new HttpException({ message: 'マシンが見つかりません' }, HttpStatus.NOT_FOUND);
    return m;
  }

  // PATCH /v1/machines/:id/status
  @Patch('/:id/status')
  async updateStatus(@Param('id') id: string, @Body() body: unknown) {
    const parsed = UpdateStatusBody.safeParse(body);
    if (!parsed.success) throw new HttpException({ message: '入力が不正です' }, HttpStatus.BAD_REQUEST);

    const m = await this.machine.updateStatus(id, parsed.data.status);
    if (!m) throw new HttpException({ message: 'マシンが見つかりません' }, HttpStatus.NOT_FOUND);
    return { machineId: m.id, status: m.status };
  }

  // GET /v1/machines/:id/slots?from=ISO&to=ISO（公開）
  @Public()
  @Get('/:id/slots')
  async slots(
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to')   to?: string,
  ) {
    const fromDate = from ? new Date(from) : new Date();
    const toDate   = to   ? new Date(to)   : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      throw new HttpException({ message: 'from/to の日時形式が不正です（ISO 8601）' }, HttpStatus.BAD_REQUEST);
    }

    return this.machine.getSlots(id, fromDate, toDate);
  }
}
