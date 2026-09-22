import { boolean, jsonb, pgTable, text } from 'drizzle-orm/pg-core';
import { timestamps, uuidV7Pk } from '../../../common/database/columns.js';

/** Config động do admin quản lý (enum + nhãn đa ngôn ngữ, ngân hàng hỗ trợ, cờ tính năng...). `is_public` → client đọc qua /public/configs. */
export const appConfigs = pgTable('app_configs', {
  id: uuidV7Pk(),
  name: text('name').notNull().unique(), // snake_case, vd system_enums
  data: jsonb('data').$type<Record<string, unknown>>().notNull(),
  isPublic: boolean('is_public').notNull().default(false),
  ...timestamps,
});
export type AppConfigRow = typeof appConfigs.$inferSelect;
