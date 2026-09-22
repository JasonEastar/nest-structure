import { boolean, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { timestamps, uuidV7Pk } from '../../../common/database/columns.js';

/** Bảng của module user. *.schema.ts chỉ import drizzle-orm, columns.ts và *.schema.ts khác. */

/** id = sub của Supabase Auth; không FK sang Supabase (khác database). */
export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id').primaryKey(),
    email: text('email'),
    displayName: text('display_name').notNull(),
    username: text('username'),
    avatarUrl: text('avatar_url'),
    locale: text('locale').notNull().default('vi'),
    homeCityCode: text('home_city_code'),
    phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true }),
    status: text('status').notNull().default('active'), // active | blocked — blocked: guard chặn mọi request
    statusReason: text('status_reason'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex('profiles_username_uq').on(t.username)],
);

/** Role là DỮ LIỆU (admin tạo/sửa/xoá qua /admin/roles); permission là CODE (common/auth/permissions.ts). */
export const roles = pgTable('roles', {
  id: uuidV7Pk(),
  code: text('code').notNull().unique(), // định danh, đặt một lần; seed: user · moderator · venue · admin
  name: text('name').notNull(),
  description: text('description'),
  isSystem: boolean('is_system').notNull().default(false), // user (mặc định khi đăng ký) và admin (mọi quyền): không xoá được
  ...timestamps,
});

/** Nhóm permission = tab trên admin UI; admin CRUD. Nhóm còn permission thì không xoá được (FK RESTRICT → service báo 409). */
export const permissionGroups = pgTable('permission_groups', {
  id: uuidV7Pk(),
  code: text('code').notNull().unique(), // snake_case, vd user_management
  name: text('name').notNull(),
  description: text('description'),
  sort: integer('sort').notNull().default(0),
  ...timestamps,
});

/** Permission là CODE (common/auth/permissions.ts); dòng DB chỉ để gán role và hiển thị (description, nhóm) — admin không tạo/xoá. */
export const permissions = pgTable('permissions', {
  id: uuidV7Pk(),
  code: text('code').notNull().unique(), // resource:action, vd pin:create
  description: text('description'),
  groupId: uuid('group_id')
    .notNull()
    .references(() => permissionGroups.id, { onDelete: 'restrict' }),
  ...timestamps,
});

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

export const userRoles = pgTable(
  'user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    cityCode: text('city_code'), // moderator theo thành phố (giai đoạn sau)
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })],
);
