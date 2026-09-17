import { Inject, Injectable, Logger, type OnModuleDestroy, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis, type RedisOptions } from 'ioredis';
import type { Env } from '../config/env.js';

/**
 * Redis tách theo vai trò (system-architecture §7):
 * - REDIS_CACHE (db0, provider ở đây): cache, rate limit, đếm — được phép mất (allkeys-lru ở prod).
 * - db1: BullMQ tự mở kết nối riêng từ `redisOptions(..., forQueue=true)` (common/queue.ts) — KHÔNG eviction,
 *   `maxRetriesPerRequest: null` bắt buộc cho worker blocking. Không có provider riêng vì không ai dùng ngoài BullMQ.
 * Prod chạy 2 Redis instance vì eviction policy không đặt theo db.
 */
export const REDIS_CACHE = Symbol('REDIS_CACHE');
export const InjectRedisCache = () => Inject(REDIS_CACHE);

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
    enableReadyCheck: true,
    lazyConnect: false,
  };
}

/** Prefix + version: đổi `v1` → `v2` để vô hiệu toàn bộ cache khi đổi shape (system-architecture §7). */
const P = 'c9:v1';
export const cacheKeys = {
  viewport: (zoom: number, tile: string, types: string) => `${P}:viewport:${zoom}:${tile}:${types}`,
  marker: (id: string) => `${P}:marker:${id}`,
  profileExists: (userId: string) => `${P}:profile-exists:${userId}`,
  deleted: (userId: string) => `${P}:deleted:${userId}`, // tombstone sau DELETE /me, sống bằng tuổi thọ token
  perms: (userId: string) => `c9:perms:${userId}`,
  count: (kind: string, id: string) => `c9:cnt:${kind}:${id}`,
  idem: (userId: string, key: string) => `c9:idem:${userId}:${key}`,
} as const;

export const TTL = {
  viewportLive: 10,
  viewportPlaces: 30,
  marker: 300,
  perms: 300,
  profileExists: 3600,
  deletedTombstone: 3600 + 300, // = access token 3600 s (Supabase mặc định) + clockTolerance dư
  idempotency: 86_400,
} as const;

/**
 * Cache mỏng trên ioredis: dùng đúng cấu trúc Redis (INCR/SADD/ZADD), NEVER đọc JSON → sửa → ghi lại (race).
 * Không dùng @nestjs/cache-manager (CacheInterceptor cache theo URL, không hợp dữ liệu theo user).
 */
@Injectable()
export class CacheService {
  constructor(@InjectRedisCache() private readonly redis: Redis) {}

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  /** Flag rẻ (vd profile-exists): tồn tại = true. */
  async flag(key: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, '1', 'EX', ttlSeconds);
  }

  async has(key: string): Promise<boolean> {
    return (await this.redis.exists(key)) === 1;
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length) await this.redis.del(...keys);
  }

  async incr(key: string, by = 1): Promise<number> {
    return this.redis.incrby(key, by);
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    return this.redis.sadd(key, ...members);
  }

  async smembers(key: string): Promise<string[]> {
    return this.redis.smembers(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.redis.expire(key, ttlSeconds);
  }

  async ping(): Promise<string> {
    return this.redis.ping();
  }
}

/** Đóng kết nối cache khi shutdown (BullMQ đóng kết nối/worker của nó qua @nestjs/bullmq). */
@Injectable()
export class RedisLifecycle implements OnModuleDestroy {
  constructor(private readonly client: Redis) {}
  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch(() => this.client.disconnect());
  }
}

export const redisProviders: Provider[] = [
  {
    provide: REDIS_CACHE,
    inject: [ConfigService],
    useFactory: (config: ConfigService<Env, true>) =>
      // 'error' không có listener → Node ném uncaughtException → cả instance chết khi Redis chớp; ioredis tự reconnect.
      new Redis(redisOptions(config, config.get('REDIS_CACHE_DB', { infer: true }))).on('error', (err: Error) =>
        new Logger('Redis').error(`cache: ${err.message}`),
      ),
  },
  CacheService,
  {
    provide: RedisLifecycle,
    inject: [REDIS_CACHE],
    useFactory: (cache: Redis) => new RedisLifecycle(cache),
  },
];
