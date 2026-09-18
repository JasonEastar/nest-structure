import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS_CACHE } from './redis.provider.js';

/**
 * Cache nghiệp vụ. Mỗi mục = key + TTL (giây) đi cùng nhau; thêm mục mới ở đây, không viết chuỗi key trong service.
 * Prefix `c9:v1`: đổi thành `v2` khi đổi shape dữ liệu để bỏ toàn bộ cache cũ.
 */
const P = 'c9:v1';
export const CACHE = {
  /** Đã có profile → request sau không chạm DB */
  profileExists: { key: (userId: string) => `${P}:profile-exists:${userId}`, ttl: 3600 },
  /** Tombstone sau DELETE /me: token còn hạn không làm profile "sống lại". TTL = tuổi thọ token + dư */
  deleted: { key: (userId: string) => `${P}:deleted:${userId}`, ttl: 3600 + 300 },
  /** Quyền hiệu lực (RBAC); admin đổi role → xoá key này */
  perms: { key: (userId: string) => `${P}:perms:${userId}`, ttl: 300 },
  /** Đã ghi last_seen của thiết bị gần đây → không UPDATE mỗi request */
  deviceSeen: { key: (userId: string, deviceId: string) => `${P}:device-seen:${userId}:${deviceId}`, ttl: 300 },
} as const;

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
