import { inject } from 'vitest';
import '../src/config/load-env.js';

/**
 * setupFile của project `integration` — chạy trong mỗi worker TRƯỚC khi test file import AppModule
 * (ConfigModule chụp process.env lúc app.module được import).
 * URL Postgres/Redis lấy từ globalSetup (testcontainers) qua inject(); ghi đè giá trị trong .env.
 * Test muốn ghi đè biến khác (vd SUPABASE_JWKS_URL) phải set process.env RỒI mới `await import('../src/app.module.js')`.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = inject('DATABASE_URL');
process.env.REDIS_URL = inject('REDIS_URL');
process.env.LOG_LEVEL ??= 'warn';
