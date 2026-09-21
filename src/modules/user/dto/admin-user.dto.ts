import { z } from 'zod';
import { PaginationQuerySchema } from '../../../common/http/pagination.js';
import { zText } from '../../../common/http/validation.js';
import { PASSWORD_LENGTH, USER_LIMITS, USER_STATUSES } from '../user.constants.js';
import { type RoleCode, RoleCodeSchema } from './role.dto.js';

/** DTO quản trị user: /admin/users (tạo tài khoản email + mật khẩu, danh sách, chi tiết, khoá). */

export const UserStatusSchema = z.enum(USER_STATUSES);
export type UserStatus = z.infer<typeof UserStatusSchema>;

/** POST /admin/users — tài khoản nhân sự (admin, moderator, venue...). User app vẫn vào bằng Google. */
export const CreateUserSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(PASSWORD_LENGTH.min).max(PASSWORD_LENGTH.max),
  displayName: zText(USER_LIMITS.displayName.max, USER_LIMITS.displayName.min).optional(), // mặc định phần trước @
  roles: z.array(RoleCodeSchema).min(1).default(['user']), // role ≠ user cần thêm quyền role:assign
}).meta({ id: 'CreateUser' });
export type CreateUser = z.infer<typeof CreateUserSchema>;

/** GET /admin/users?q= — tìm theo email hoặc tên; cursor như mọi danh sách. */
export const ListUsersQuerySchema = PaginationQuerySchema.extend({ q: z.string().trim().min(1).max(100).optional() });
export type ListUsersQuery = z.infer<typeof ListUsersQuerySchema>;

/** PATCH /admin/users/:id/status — blocked: guard chặn mọi request của user đó ngay trên mọi instance. */
export const SetUserStatusSchema = z.object({
  status: UserStatusSchema,
  reason: zText(200).optional(),
}).meta({ id: 'SetUserStatus' });
export type SetUserStatus = z.infer<typeof SetUserStatusSchema>;

export const AdminUserSchema = z.object({
  id: z.uuid(),
  email: z.email().nullable(),
  displayName: z.string(),
  username: z.string().nullable(),
  avatarUrl: z.url().nullable(),
  status: UserStatusSchema,
  statusReason: z.string().nullable(),
  roles: z.array(RoleCodeSchema),
  createdAt: z.iso.datetime(),
}).meta({ id: 'AdminUser' });
export type AdminUser = z.infer<typeof AdminUserSchema>;

export interface AdminUserRow {
  id: string;
  email: string | null;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  status: string;
  statusReason: string | null;
  createdAt: Date;
}

export function toAdminUser(row: AdminUserRow, roles: RoleCode[]): AdminUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    username: row.username,
    avatarUrl: row.avatarUrl,
    status: row.status as UserStatus,
    statusReason: row.statusReason,
    roles,
    createdAt: row.createdAt.toISOString(),
  };
}
