import { Logger, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis, type RedisOptions } from 'ioredis';
import type { Env } from '../../config/env.js';

/**
 * Kết nối Redis. db0 (REDIS_CACHE) = cache + rate limit, được phép mất. db1 = BullMQ, mở riêng ở queue.ts.
 * Nghiệp vụ dùng CacheService (cache.ts); chỉ throttler/health inject Redis thô: `@Inject(REDIS_CACHE) redis: Redis`.
 */
export const REDIS_CACHE = Symbol('REDIS_CACHE');
export const REDIS_DB = { cache: 0, queue: 1 } as const;

/** REDIS_URL → options ioredis. `forQueue`: BullMQ bắt buộc maxRetriesPerRequest = null. */
export function redisOptions(config: ConfigService<Env, true>, db: number, forQueue = false): RedisOptions {
  const url = new URL(config.get('REDIS_URL', { infer: true }));
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    tls: url.protocol === 'rediss:' ? {} : undefined,
    db,
    maxRetriesPerRequest: forQueue ? null : 3,
  };
}

export const redisProvider: Provider = {
  provide: REDIS_CACHE,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) =>
    // Bắt buộc có listener 'error': không có thì Redis chớp một cái là cả instance chết (uncaughtException).
    new Redis(redisOptions(config, REDIS_DB.cache)).on('error', (err: Error) => new Logger('Redis').error(err.message)),
};
