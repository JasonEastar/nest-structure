import { boolean, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { geographyPoint, timestamps, uuidV7Pk } from '../../../common/database/columns.js';
import { profiles } from '../../user/schema/user.schema.js';

/**
 * Bảng của module location. Quy tắc (ADR-0006 §6): chỉ import drizzle-orm, common/database/columns.ts và *.schema.ts khác.
 * Thêm bảng → `npm run db:generate` → sửa tay kiểu customType bị đặt trong nháy (`"geography(Point,4326)"` → bỏ nháy)
 * → `npm run db:migrate`. Nhớ export ở common/database/schema.ts.
 */

/** Địa điểm user tự lưu (nhà, công ty, trường con...). Nền cho "My areas" cảnh báo theo vùng (roadmap bước 11). */
export const savedLocations = pgTable(
  'saved_locations',
  {
    id: uuidV7Pk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }), // xoá tài khoản → xoá địa điểm
    name: text('name').notNull(),
    point: geographyPoint('point').notNull(),
    radiusMeters: integer('radius_m').notNull().default(500),
    isPublic: boolean('is_public').notNull().default(false), // chủ nhân cho phép hiện trên API public (mặc định riêng tư)
    ...timestamps,
  },
  (t) => [
    index('saved_locations_user_created_idx').on(t.userId, t.createdAt, t.id), // list theo user + cursor (created_at, id)
    index('saved_locations_point_gist').using('gist', t.point), // ST_DWithin / nearby
  ],
);

export type SavedLocationRow = typeof savedLocations.$inferSelect;
