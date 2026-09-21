import { existsSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

/**
 * Chạy migration trong image runtime (server không có drizzle-kit): `node dist/migrate.js`.
 * Cùng bảng/schema journal với `npm run db:migrate` (drizzle.config.ts) nên hai cách dùng lẫn được.
 */
if (existsSync('.env')) process.loadEnvFile('.env');
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');

const sql = postgres(url, { max: 1, onnotice: () => {} });
await migrate(drizzle(sql), { migrationsFolder: 'drizzle', migrationsTable: '__drizzle_migrations', migrationsSchema: 'drizzle' });
await sql.end();
console.log('migrations applied');
