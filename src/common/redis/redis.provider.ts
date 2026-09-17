import { Inject, Injectable, Logger, type OnModuleDestroy, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis, type RedisOptions } from 'ioredis';
import type { Env } from '../../config/env.js';

/**
 * Kết nối Redis. db0 (REDIS_CACHE) = cache + rate limit, được phép mất. db1 = BullMQ, mở riêng ở queue.ts.
 * Nghiệp vụ không dùng file này trực tiếp: dùng CacheService (cache.ts). Chỉ throttler/health inject Redis thô.
 */
export const REDIS_CACHE = Symbol('REDIS_CACHE');
export const InjectRedisCache = () => Inject(REDIS_CACHE);

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

/** Giữ client để QUIT khi app tắt. */
@Injectable()
class RedisLifecycle implements OnModuleDestroy {
  constructor(@InjectRedisCache() private readonly redis: Redis) {}
  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}

export const redisProviders: Provider[] = [
  {
    provide: REDIS_CACHE,
    inject: [ConfigService],
    useFactory: (config: ConfigService<Env, true>) =>
      // Bắt buộc có listener 'error': không có thì Redis chớp một cái là cả instance chết (uncaughtException).
      new Redis(redisOptions(config, config.get('REDIS_CACHE_DB', { infer: true }))).on('error', (err: Error) =>
        new Logger('Redis').error(err.message),
      ),
  },
  RedisLifecycle,
];
