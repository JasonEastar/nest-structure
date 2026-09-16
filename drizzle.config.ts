import { defineConfig } from 'drizzle-kit';

// Chạy bằng CLI (npm run db:*), không import vào app. DATABASE_URL đọc từ môi trường / .env.
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required for drizzle-kit (put it in .env or the environment)');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/**/*.schema.ts', // mỗi module sở hữu bảng của mình (ADR-0006)
  out: './drizzle',
  casing: 'snake_case',
  dbCredentials: { url: process.env.DATABASE_URL },
  extensionsFilters: ['postgis'], // bỏ qua bảng nội bộ của PostGIS khi introspect/push
  migrations: { table: '__drizzle_migrations', schema: 'drizzle' },
  strict: true,
  verbose: true,
});
