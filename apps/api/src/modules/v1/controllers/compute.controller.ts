import { Body, Controller, Get, HttpException, HttpStatus, Logger, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { FeatureFlagsService } from '../services/featureFlags.service';
import { ComputeService } from '../services/compute.service';
import { Public } from '../decorators/public.decorator';

const SubmitJobBody = z.object({
  requesterId: z.string().min(1),
  taskType: z.string().min(1),
  taskSpec: z.object({
    command: z.string().min(1),
    inputUri: z.string().min(1),
    outputUri: z.string().min(1),
    envVars: z.record(z.string()).optional(),
    dockerImage: z.string().optional(),
  }),
});

@Controller('/v1/compute')
export class ComputeController {
  private readonly logger = new Logger(ComputeController.name);

  constructor(
    private readonly flags: FeatureFlagsService,
    private readonly compute: ComputeService,
  ) {}

  @Public()
  @Get('/nodes')
  async nodes() {
    if (!this.flags.computeMarketEnabled()) {
      throw new HttpException({ message: 'コンピュート市場は無効です' }, HttpStatus.NOT_IMPLEMENTED);
    }
    return this.compute.listMachines();
  }

  @Post('/jobs')
  async submit(@Body() body: unknown) {
    if (!this.flags.computeMarketEnabled()) {
      throw new HttpException({ message: 'コンピュート市場は無効です' }, HttpStatus.NOT_IMPLEMENTED);
    }
    if (!this.flags.computeOnchainWriteEnabled()) {
      this.logger.warn('[compute.submit] onchain write disabled');
      throw new HttpException(
        { message: 'コンピュート購入はオンチェーン実装が未完了のため停止中です' },
        HttpStatus.NOT_IMPLEMENTED,
      );
    }

    const parsed = SubmitJobBody.safeParse(body);
    if (!parsed.success) {
      throw new HttpException({ message: '入力が不正です' }, HttpStatus.BAD_REQUEST);
    }

    const job = await this.compute.submitJob({
      buyerUserId: parsed.data.requesterId,
      jobType: parsed.data.taskType,
      schedulerRef: JSON.stringify(parsed.data.taskSpec),
    });
    return { jobId: job.id };
  }

  @Get('/jobs/:jobId')
  async getJob(@Param('jobId') jobId: string) {
    if (!this.flags.computeMarketEnabled()) {
      throw new HttpException({ message: 'コンピュート市場は無効です' }, HttpStatus.NOT_IMPLEMENTED);
    }
    const job = await this.compute.getJob(jobId);
    if (!job) throw new HttpException({ message: 'ジョブが見つかりません' }, HttpStatus.NOT_FOUND);
    return { jobId: job.id, status: job.status };
  }

  @Post('/jobs/:jobId/cancel')
  async cancel(@Param('jobId') jobId: string) {
    if (!this.flags.computeMarketEnabled()) {
      throw new HttpException({ message: 'コンピュート市場は無効です' }, HttpStatus.NOT_IMPLEMENTED);
    }
    if (!this.flags.computeOnchainWriteEnabled()) {
      throw new HttpException(
        { message: 'コンピュート購入はオンチェーン実装が未完了のため停止中です' },
        HttpStatus.NOT_IMPLEMENTED,
      );
    }

    const job = await this.compute.cancelJob(jobId);
    if (!job) {
      throw new HttpException({ message: 'ジョブが見つからないかキャンセルできません' }, HttpStatus.NOT_FOUND);
    }
    return { jobId: job.id, cancelled: true as const };
  }

  @Get('/jobs/:jobId/result')
  async result(@Param('jobId') jobId: string) {
    if (!this.flags.computeMarketEnabled()) {
      throw new HttpException({ message: 'コンピュート市場は無効です' }, HttpStatus.NOT_IMPLEMENTED);
    }
    const result = await this.compute.getJobResult(jobId);
    if (!result) throw new HttpException({ message: 'ジョブが見つかりません' }, HttpStatus.NOT_FOUND);
    return { jobId: result.jobId, resultUri: result.resultHash };
  }
}
