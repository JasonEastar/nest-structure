import { Inject, Injectable, Logger, type OnModuleDestroy, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis, type RedisOptions } from 'ioredis';
import type { Env } from '../../config/env.js';

/**
 * Redis db0 = cache, rate limit (được phép mất). db1 = BullMQ, kết nối riêng mở ở queue.ts (không được mất).
 * Prod chạy 2 Redis instance vì eviction policy không đặt theo db (system-architecture §7).
 */
export const REDIS_CACHE = Symbol('REDIS_CACHE');
/** `@InjectRedisCache() redis: Redis` khi cần ioredis thô (throttler, health). Nghiệp vụ dùng CacheService. */
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
    enableReadyCheck: true,
    lazyConnect: false,
  };
}

/**
 * Key cache đang dùng. Prefix `c9:v1` — đổi `v1` → `v2` khi đổi shape để vô hiệu toàn bộ cache cũ.
 * Thêm key mới ở đây khi module mới cần (không viết chuỗi key rải rác trong service).
 */
const P = 'c9:v1';
export const cacheKeys = {
  profileExists: (userId: string) => `${P}:profile-exists:${userId}`, // đã có profile → request sau không chạm DB
  deleted: (userId: string) => `${P}:deleted:${userId}`, // tombstone sau DELETE /me (token còn hạn không "sống lại")
  perms: (userId: string) => `${P}:perms:${userId}`, // quyền hiệu lực (RBAC), xoá khi admin đổi role
  deviceSeen: (userId: string, deviceId: string) => `${P}:device-seen:${userId}:${deviceId}`, // throttle ghi last_seen
} as const;

/** TTL (giây) đi kèm từng key ở trên. */
export const TTL = {
  profileExists: 3600,
  deletedTombstone: 3600 + 300, // = tuổi thọ access token Supabase (3600 s) + clockTolerance
  perms: 300,
  deviceSeen: 300,
} as const;

/**
 * Cache mỏng trên ioredis, chỉ 5 thao tác đang cần. Cần INCR/SADD/... thì thêm method đúng cấu trúc Redis,
 * NEVER đọc JSON → sửa → ghi lại (race giữa 2 instance).
 * Không dùng @nestjs/cache-manager (CacheInterceptor cache theo URL, không hợp dữ liệu theo user).
 */
@Injectable()
export class CacheService {
  constructor(@InjectRedisCache() private readonly redis: Redis) {}

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  }

  /** Ghi object dạng JSON, luôn có TTL (không có key sống mãi). */
  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  /** Cờ rẻ: tồn tại = true. */
  async flag(key: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, '1', 'EX', ttlSeconds);
  }

  /** Key có tồn tại không (dùng cho cờ). */
  async has(key: string): Promise<boolean> {
    return (await this.redis.exists(key)) === 1;
  }

  /** Xoá nhiều key một lần (vô hiệu cache khi dữ liệu đổi). */
  async del(...keys: string[]): Promise<void> {
    if (keys.length) await this.redis.del(...keys);
  }
}

/** Đóng kết nối cache khi shutdown (BullMQ đóng kết nối/worker của nó qua @nestjs/bullmq). */
@Injectable()
export class RedisLifecycle implements OnModuleDestroy {
  constructor(private readonly client: Redis) {}
  /** QUIT khi app tắt; lỗi thì ngắt thẳng. */
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
