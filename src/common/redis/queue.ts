import { BullModule } from '@nestjs/bullmq';
import type { ConnectionOptions } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { redisOptions } from './cache.js';

/**
 * BullMQ root (system-architecture §8). Processor sống trong module nghiệp vụ (`<x>.jobs.ts`) và chạy trên MỌI instance.
 * Cron = `queue.upsertJobScheduler(id cố định)` — KHÔNG @nestjs/schedule (nhân theo replica).
 * Tên queue là hằng ở đây để module và Bull Board dùng chung.
 */
export const QUEUES = {
  MARKER_MAINTENANCE: 'marker-maintenance',
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

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
