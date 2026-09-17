import { BullModule } from '@nestjs/bullmq';
import type { ConnectionOptions } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { redisOptions } from './redis.provider.js';

/**
 * BullMQ root (system-architecture §8). Processor sống trong module nghiệp vụ (`<x>.jobs.ts`) và chạy trên MỌI instance.
 * Cron = `queue.upsertJobScheduler(id cố định)` — KHÔNG @nestjs/schedule (nhân theo replica).
 * Tên queue là hằng ở đây để module và Bull Board dùng chung.
 */
export const QUEUES = {
  // Chưa có queue nào. Module cần job nền: thêm `TEN: 'ten-queue'` ở đây, `BullModule.registerQueue({ name })` trong module,
  // `@Processor(QUEUES.TEN)` trong `<x>.jobs.ts`; cron dùng `queue.upsertJobScheduler(id cố định)`.
} as const;

export const QueueRootModule = BullModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) => ({
    prefix: 'c9', // key bull:… → c9:… (không đụng cache prefix c9:v1)
    // bullmq bundle ioredis riêng → kiểu RedisOptions khác nhau về danh nghĩa, cùng shape
    connection: redisOptions(config, config.get('REDIS_QUEUE_DB', { infer: true }), true) as ConnectionOptions,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  }),
});
