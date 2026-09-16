import { hostname } from 'node:os';
import { z } from 'zod';

/**
 * Toàn bộ biến môi trường của c9_map. Nơi duy nhất đọc `process.env`.
 * - `loadEnv()` dùng trong `main.ts` trước khi Nest boot (fail-fast, in tên biến thiếu).
 * - `ConfigModule.forRoot({ validationSchema: envSchema })` để Nest cũng validate và
 *   cung cấp `ConfigService<Env, true>` cho provider.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  INSTANCE_ID: z.string().min(1).default(hostname()),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1), // nginx = 1; thêm ALB phía trước = 2

  // Postgres 16 + PostGIS (tự host). Migration dùng cùng URL (prod: role c9_migrate qua env riêng khi deploy).
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),

  // Redis 7: db0 cache (allkeys-lru), db1 BullMQ (noeviction). Prod: 2 instance riêng vì eviction không đặt theo db.
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  REDIS_CACHE_DB: z.coerce.number().int().min(0).max(15).default(0),
  REDIS_QUEUE_DB: z.coerce.number().int().min(0).max(15).default(1),

  // Rate limit mặc định (đếm chung mọi instance qua Redis). Override từng route bằng @Throttle.
  THROTTLE_SHORT_LIMIT: z.coerce.number().int().min(1).default(10), // / 1 giây
  THROTTLE_LONG_LIMIT: z.coerce.number().int().min(1).default(100), // / 1 phút
});

export type Env = z.infer<typeof envSchema>;

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
