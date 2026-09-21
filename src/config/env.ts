import { z } from 'zod';

/** Toàn bộ biến môi trường. ConfigModule (app.module.ts) đọc .env, validate bằng schema này; sai/thiếu → app không boot. */
/** URL tuỳ chọn: để trống trong .env (`X=`) coi như không đặt. */
const optionalUrl = z.preprocess((v) => (v === '' ? undefined : v), z.url().optional());

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  PUBLIC_URL: optionalUrl, // URL công khai khi deploy, hiện ở Swagger → Servers
  SENTRY_DSN: optionalUrl, // có → lỗi, log, trace lên Sentry; trống = tắt

  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }), // db0 cache + rate limit, db1 BullMQ

  // Supabase chỉ làm auth. Backend chỉ cần URL (JWKS) + secret key; sb_publishable_… là của client (script dev-token đọc riêng)
  SUPABASE_URL: z.url({ protocol: /^https?$/ }),
  SUPABASE_SECRET_KEY: z.string().min(20),

  THROTTLE_SHORT_LIMIT: z.coerce.number().int().min(1).default(10), // request / giây / IP / route
  THROTTLE_LONG_LIMIT: z.coerce.number().int().min(1).default(300), // request / phút / IP / route (app bản đồ gọi viewport liên tục)
});

export type Env = z.infer<typeof envSchema>;
