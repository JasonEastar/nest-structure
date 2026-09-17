import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job, Queue } from 'bullmq';
import { QUEUES } from '../../common/redis/queue.js';
import type { Env } from '../../config/env.js';
import { MARKER_EXPIRE_JOB } from './pin.constants.js';

/**
 * Job nền của pin — chạy trên MỌI instance (all-in-one, ADR-0006).
 * - PinScheduler: `upsertJobScheduler` id cố định → dù N instance cùng gọi, chỉ 1 lịch, mỗi phút 1 job, 1 worker nhận.
 * - PinJobs: xử lý job; phase skeleton chỉ log 1 dòng (nghiệp vụ expire ở bước 9).
 */
@Injectable()
export class PinScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(PinScheduler.name);

  constructor(@InjectQueue(QUEUES.MARKER_MAINTENANCE) private readonly queue: Queue) {}

  async onApplicationBootstrap(): Promise<void> {
    const { schedulerId, jobName, pattern, tz } = MARKER_EXPIRE_JOB;
    await this.queue.upsertJobScheduler(schedulerId, { pattern, tz }, { name: jobName, data: {} });
    this.logger.log(`scheduler upserted id=${schedulerId} pattern="${pattern}" tz=${tz}`);
  }
}

@Processor(QUEUES.MARKER_MAINTENANCE, { concurrency: 2 })
export class PinJobs extends WorkerHost {
  private readonly logger = new Logger(PinJobs.name);
  private readonly instance: string;

  constructor(config: ConfigService<Env, true>) {
    super();
    this.instance = config.get('INSTANCE_ID', { infer: true });
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case MARKER_EXPIRE_JOB.jobName:
        // Bước 9: UPDATE markers SET status='expired' WHERE expires_at < now() AND status='live'
        this.logger.log(`expire tick job=${job.id} instance=${this.instance}`);
        return;
      default:
        this.logger.warn(`unknown job name=${job.name} id=${job.id}`);
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job | undefined, error: Error): void {
    this.logger.error(`job failed name=${job?.name} id=${job?.id} attempts=${job?.attemptsMade}`, error.stack);
  }
}
