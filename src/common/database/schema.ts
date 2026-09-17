/**
 * Barrel gom mọi *.schema.ts để `drizzle(client, { schema })` có kiểu đầy đủ.
 * drizzle-kit dùng glob `src/**\/*.schema.ts` (drizzle.config.ts); runtime dùng file này.
 * Thêm module mới → thêm một dòng export ở đây.
 */
export * from '../../modules/user/schema/user.schema.js';
export * from '../../modules/location/schema/location.schema.js';
