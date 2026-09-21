import { existsSync } from 'node:fs';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer, type StartedRedisContainer } from '@testcontainers/redis';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import type { TestProject } from 'vitest/node';

/**
 * globalSetup cho project `integration`: dựng PostGIS 16-3.4 + Redis 7 THẬT bằng testcontainers,
 * chạy migration (0000 → seed RBAC), rồi đưa URL cho worker qua `provide()` + process.env.
 * Không cần `npm run dev:infra`. Đặt TEST_REUSE_INFRA=1 để dùng Postgres/Redis trong .env (nhanh hơn khi dev).
 */
declare module 'vitest' {
  export interface ProvidedContext {
    DATABASE_URL: string;
    REDIS_URL: string;
  }
}

let pg: StartedPostgreSqlContainer | undefined;
let redis: StartedRedisContainer | undefined;

export async function setup(project: TestProject): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env'); // cho TEST_REUSE_INFRA=1 (globalSetup chạy ngoài worker)
  let databaseUrl = process.env.DATABASE_URL;
  let redisUrl = process.env.REDIS_URL;

  if (process.env.TEST_REUSE_INFRA !== '1') {
    // Gán từng container ngay khi start xong: nếu cái sau lỗi, teardown() vẫn dừng được cái trước (không dựa vào Ryuk).
    try {
      pg = await new PostgreSqlContainer('postgis/postgis:16-3.4')
        .withDatabase('c9_map_test')
        .withUsername('c9')
        .withPassword('c9')
        .start();
      redis = await new RedisContainer('redis:7-alpine').start();
    } catch (err) {
      await teardown();
      throw err;
    }
    databaseUrl = pg.getConnectionUri();
    redisUrl = redis.getConnectionUrl();
  }
  if (!databaseUrl || !redisUrl) throw new Error('TEST_REUSE_INFRA=1 cần DATABASE_URL và REDIS_URL trong .env');

  // Migration là bước riêng, không chạy lúc boot (code-standards §2.3) → chạy ở đây, một lần cho cả suite.
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(sql), {
      migrationsFolder: 'drizzle',
      migrationsSchema: 'drizzle',
      migrationsTable: '__drizzle_migrations',
    });
  } catch (err) {
    await teardown();
    throw err;
  } finally {
    await sql.end();
  }

  process.env.DATABASE_URL = databaseUrl;
  process.env.REDIS_URL = redisUrl;
  project.provide('DATABASE_URL', databaseUrl);
  project.provide('REDIS_URL', redisUrl);
}

export async function teardown(): Promise<void> {
  await Promise.all([pg?.stop(), redis?.stop()]);
}
