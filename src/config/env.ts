import { hostname } from 'node:os';
import { z } from 'zod';

/** Toàn bộ biến môi trường, nơi duy nhất đọc process.env. Sai/thiếu → app không boot, in tên biến. */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  INSTANCE_ID: z.string().min(1).default(hostname()),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1), // nginx = 1; thêm ALB phía trước = 2
  PUBLIC_URL: z.url({ protocol: /^https?$/ }).optional(), // URL công khai của API (staging/prod) → mục Servers trong Swagger
  AXIOM_TOKEN: z.string().min(10).optional(), // đặt cả 2 biến Axiom → log gửi thêm lên Axiom (xem logger.ts)
  AXIOM_DATASET: z.string().min(1).optional(),

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

/** Parse + validate env; sai → throw liệt kê từng biến (app không boot với cấu hình thiếu). */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`,
    );
    throw new Error(`Invalid environment variables:\n${lines.join('\n')}`);
  }
  return result.data;
}
