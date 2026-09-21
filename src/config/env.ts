import { hostname } from 'node:os';
import { z } from 'zod';

/** Toàn bộ biến môi trường. ConfigModule (app.module.ts) đọc .env, validate bằng schema này; sai/thiếu → app không boot. */
/** URL tuỳ chọn: để trống trong .env (`X=`) coi như không đặt. */
const optionalUrl = z.preprocess((v) => (v === '' ? undefined : v), z.url().optional());

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  INSTANCE_ID: z.string().min(1).default(hostname()), // compose đặt api-1, api-2; hiện trong log và header X-Instance-Id
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1), // số reverse proxy phía trước (nginx = 1)
  PUBLIC_URL: optionalUrl, // URL công khai khi deploy, hiện ở Swagger → Servers
  SENTRY_DSN: optionalUrl, // có → lỗi, log, trace lên Sentry; trống = tắt

  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }), // db0 cache + rate limit, db1 BullMQ

  // Supabase chỉ làm auth. sb_publishable_… cho client và script dev-token, sb_secret_… chỉ server
  SUPABASE_URL: z.url({ protocol: /^https?$/ }),
  SUPABASE_JWKS_URL: optionalUrl, // mặc định suy từ SUPABASE_URL; test trỏ vào JWKS giả
  SUPABASE_PUBLISHABLE_KEY: z.string().min(20).optional(),
  SUPABASE_SECRET_KEY: z.string().min(20),

  THROTTLE_SHORT_LIMIT: z.coerce.number().int().min(1).default(10), // request / giây / user
  THROTTLE_LONG_LIMIT: z.coerce.number().int().min(1).default(30), // request / phút / user
});

export type Env = z.infer<typeof envSchema>;
