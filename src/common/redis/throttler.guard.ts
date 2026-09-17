import { type ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard, type ThrottlerLimitDetail, ThrottlerModule, type ThrottlerStorage } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import type { Redis } from 'ioredis';
import type { Env } from '../../config/env.js';
import { AppException } from '../http/exceptions.js';
import { REDIS_CACHE } from './redis.provider.js';

/**
 * Rate limit đếm chung mọi instance qua Redis: short 10/s, long 100/phút; tracker user → x-device-id → IP.
 * Override route: `@Throttle({ short: { limit, ttl } })`, bỏ qua: `@SkipThrottle()`. Guard đầu chuỗi (chặn trước khi verify JWT).
 * Storage tự viết bằng Lua (fixed window) vì package Redis chính thức chưa hỗ trợ Nest 12.
 */
const INCREMENT_LUA = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
local blockTtl = redis.call('PTTL', KEYS[2])
if hits > tonumber(ARGV[2]) and tonumber(ARGV[3]) > 0 and blockTtl < 0 then
  redis.call('SET', KEYS[2], 1, 'PX', ARGV[3])
  blockTtl = tonumber(ARGV[3])
end
return { hits, ttl, blockTtl }
`;

export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: Redis) {}

  /** Đếm một lần (Lua nguyên tử), trả số hit + thời gian còn lại. */
  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): ReturnType<ThrottlerStorage['increment']> {
    const base = `c9:throttle:${throttlerName}:${key}`;
    const [hits, ttlMs, blockMs] = (await this.redis.eval(
      INCREMENT_LUA,
      2,
      base,
      `${base}:block`,
      ttl,
      limit,
      blockDuration,
    )) as [number, number, number];
    return {
      totalHits: hits,
      timeToExpire: Math.max(0, Math.ceil(ttlMs / 1000)),
      isBlocked: blockMs > 0,
      timeToBlockExpire: Math.max(0, Math.ceil(blockMs / 1000)),
    };
  }
}

export const AppThrottlerModule = ThrottlerModule.forRootAsync({
  imports: [],
  inject: [ConfigService, REDIS_CACHE],
  useFactory: (config: ConfigService<Env, true>, redis: Redis) => ({
    throttlers: [
      { name: 'short', ttl: 1_000, limit: config.get('THROTTLE_SHORT_LIMIT', { infer: true }) },
      { name: 'long', ttl: 60_000, limit: config.get('THROTTLE_LONG_LIMIT', { infer: true }) },
    ],
    storage: new RedisThrottlerStorage(redis),
    skipIf: (ctx: ExecutionContext) => {
      const path = ctx.switchToHttp().getRequest<Request>().path;
      return path.startsWith('/health') || path.startsWith('/docs');
    },
  }),
});

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Request): Promise<string> {
    if (req.user?.id) return `u:${req.user.id}`;
    const device = req.header('x-device-id');
    if (device && /^[A-Za-z0-9._-]{8,128}$/.test(device)) return `d:${device}`;
    return `ip:${req.ip ?? 'unknown'}`;
  }

  /** 429 theo shape lỗi dự án + Retry-After (giây). */
  protected override async throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const res = context.switchToHttp().getResponse<Response>();
    const retryAfter = Math.max(1, Math.ceil(detail.timeToBlockExpire || detail.timeToExpire));
    res.setHeader('Retry-After', String(retryAfter));
    throw new AppException('RATE_LIMITED', { retryAfter, limit: detail.limit, ttl: detail.ttl });
  }
}
