import { existsSync } from 'node:fs';
import { inject } from 'vitest';

if (existsSync('.env')) process.loadEnvFile('.env'); // SUPABASE_* v.v. cho test; DATABASE_URL/REDIS_URL ghi đè bên dưới

/**
 * setupFile của project `integration`, chạy trong mỗi worker trước test file. URL Postgres/Redis lấy từ testcontainers qua inject().
 * Test muốn ghi đè biến khác (vd SUPABASE_JWKS_URL) phải set process.env RỒI mới `await import('../../src/app.module.js')`.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = inject('DATABASE_URL');
process.env.REDIS_URL = inject('REDIS_URL');
process.env.LOG_LEVEL ??= 'warn';
