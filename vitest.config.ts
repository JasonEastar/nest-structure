import { defineConfig } from 'vitest/config';

/**
 * Hai project (docs/testing-and-ci.md):
 * - unit        : `src/**\/*.spec.ts` cạnh code, logic thuần, không hạ tầng, chạy trong < 5 s.
 * - integration : `test/**\/*.spec.ts` — boot AppModule thật trên PostGIS + Redis do testcontainers dựng
 *                 (globalSetup), migration thật, không mock DB. Cần Docker. Supabase thật chỉ khi có SUPABASE_* (tự skip).
 * Chạy: `npm test` (cả hai) · `npm run test:unit` · `npm run test:integration` · `TEST_REUSE_INFRA=1` dùng .env.
 */
export default defineConfig({
  test: {
    globals: true,
    root: './',
    projects: [
      {
        test: {
          name: 'unit',
          globals: true,
          include: ['src/**/*.spec.ts'],
        },
      },
      {
        test: {
          name: 'integration',
          globals: true,
          include: ['test/**/*.spec.ts'],
          globalSetup: ['./test/setup/containers.ts'],
          setupFiles: ['./test/setup-env.ts'],
          testTimeout: 30_000,
          hookTimeout: 120_000, // kéo image + start container lần đầu
          fileParallelism: false, // các file dùng chung Redis/DB; chạy tuần tự để bộ đếm throttle/scheduler không chồng nhau
        },
      },
    ],
  },
});
