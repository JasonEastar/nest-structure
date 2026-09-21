import { BullModule } from '@nestjs/bullmq';
import type { ConnectionOptions } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { REDIS_DB, redisOptions } from './redis.provider.js';

/**
 * BullMQ (Redis db1). Chưa có queue. Khi cần: thêm tên vào QUEUES, `BullModule.registerQueue` trong module,
 * `@Processor` trong `<x>.jobs.ts`; cron dùng `queue.upsertJobScheduler(id cố định)`, KHÔNG dùng @nestjs/schedule (nhân theo instance).
 */
export const QUEUES = {} as const;

export const QueueRootModule = BullModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) => ({
    prefix: 'c9',
    connection: redisOptions(config, REDIS_DB.queue, true) as ConnectionOptions,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  }),
});
