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
