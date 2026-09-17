import {
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

/**
 * Bảng của module identity. Quy tắc (ADR-0006 §6): file *.schema.ts chỉ import drizzle-orm
 * và *.schema.ts khác — không import common/database/drizzle.ts.
 */

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

const uuidV7Pk = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7());

/** id = `sub` của Supabase Auth (uuid v4). Không FK sang Supabase (khác database, ADR-0005). */
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
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex('profiles_username_uq').on(t.username)],
);

export const roles = pgTable('roles', {
  id: uuidV7Pk(),
  code: text('code').notNull().unique(), // user | moderator | venue | admin
  name: text('name').notNull(),
  ...timestamps,
});

export const permissions = pgTable('permissions', {
  id: uuidV7Pk(),
  code: text('code').notNull().unique(), // resource:action, vd pin:create
  description: text('description'),
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

/** Push token gắn với thiết bị, không gắn với user (code-standards §2.4). */
export const devices = pgTable(
  'devices',
  {
    id: uuidV7Pk(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    deviceId: text('device_id').notNull(), // header x-device-id
    platform: text('platform'), // ios | android
    pushToken: text('push_token'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('devices_user_device_uq').on(t.userId, t.deviceId),
    index('devices_push_token_idx').on(t.pushToken),
  ],
);
