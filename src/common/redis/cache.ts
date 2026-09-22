import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CACHE } from './redis.provider.js';

/**
 * Mục cache = key + TTL (giây) đi cùng nhau. Mỗi module khai mục của mình trong `<x>.constants.ts` bằng `cacheEntry`
 * (vd `USER_CACHE` ở user.constants.ts) và CHỈ chạm key của mình; cần vô hiệu cache module khác → gọi service module đó.
 * Key luôn có dạng `c9:v1:<module>:<name>:<id>` → nhìn trong RedisInsight biết ngay của ai. Đổi `v1` → `v2` khi đổi shape dữ liệu.
 */
const PREFIX = 'c9:v1';
export const cacheEntry = (module: string, name: string, ttlSeconds: number) => ({
  key: (...ids: string[]) => `${PREFIX}:${module}:${name}:${ids.join(':')}`,
  ttl: ttlSeconds,
});

/**
 * 5 thao tác đang dùng. Cần INCR/SADD... thì thêm method đúng cấu trúc Redis; NEVER đọc JSON → sửa → ghi lại (race).
 */
@Injectable()
export class CacheService {
  constructor(@Inject(REDIS_CACHE) private readonly redis: Redis) {}

  /** Đọc object đã lưu dạng JSON; null nếu không có. */
  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  }

  /** Ghi object dạng JSON, luôn có TTL. */
  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  /** Đặt cờ (tồn tại = true), có TTL. */
  async flag(key: string, ttlSeconds: number): Promise<void> {
    await this.redis.set(key, '1', 'EX', ttlSeconds);
  }

  /** Cờ/key có tồn tại không. */
  async has(key: string): Promise<boolean> {
    return (await this.redis.exists(key)) === 1;
  }

  /** Xoá một hoặc nhiều key (vô hiệu cache khi dữ liệu đổi). */
  async del(...keys: string[]): Promise<void> {
    if (keys.length) await this.redis.del(...keys);
  }
}
