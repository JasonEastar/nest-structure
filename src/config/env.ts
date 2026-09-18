import { hostname } from 'node:os';
import { z } from 'zod';

/** Toàn bộ biến môi trường. ConfigModule (app.module.ts) đọc .env, validate bằng schema này; sai/thiếu → app không boot. */
/** URL tuỳ chọn: để trống trong .env (`X=`) coi như không đặt. */
const optionalUrl = z.preprocess((v) => (v === '' ? undefined : v), z.url().optional());

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  INSTANCE_ID: z.string().min(1).default(hostname()),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1), // nginx = 1; thêm ALB phía trước = 2
  PUBLIC_URL: optionalUrl, // URL công khai của API (staging/prod) → mục Servers trong Swagger
  SENTRY_DSN: optionalUrl, // có → lỗi 5xx, log và trace lên Sentry (src/instrument.ts)

  // Postgres 16 + PostGIS (tự host)
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),

  // Redis 7: app dùng db0 cho cache/rate limit, db1 cho BullMQ (cố định trong code). Prod tách 2 instance → thêm REDIS_QUEUE_URL khi đó.
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),

  // Supabase: chỉ auth. sb_publishable_… cho client, sb_secret_… chỉ server
  SUPABASE_URL: z.url({ protocol: /^https?$/ }),
  SUPABASE_JWKS_URL: z.url({ protocol: /^https?$/ }).optional(), // mặc định `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`
  SUPABASE_PUBLISHABLE_KEY: z.string().min(20).optional(), // chỉ scripts/dev-token và test Supabase thật
  SUPABASE_SECRET_KEY: z.string().min(20),

  // Rate limit mặc định (đếm chung mọi instance). Override từng route bằng @Throttle
  THROTTLE_SHORT_LIMIT: z.coerce.number().int().min(1).default(10), // / 1 giây
  THROTTLE_LONG_LIMIT: z.coerce.number().int().min(1).default(100), // / 1 phút
});

export type Env = z.infer<typeof envSchema>;
