import { z } from 'zod';
import { zText } from '../../../common/http/validation.js';
import { ROLE_CODE, ROLE_NAME_MAX } from '../user.constants.js';

/** DTO role/RBAC. Role và permission đều là dữ liệu trong DB; zod chỉ kiểm định dạng, tồn tại hay không do service tra. */

export const RoleCodeSchema = z
  .string()
  .trim()
  .min(ROLE_CODE.min)
  .max(ROLE_CODE.max)
  .regex(ROLE_CODE.pattern, 'validation.code_format');
export type RoleCode = z.infer<typeof RoleCodeSchema>;

/** `resource:action`; tồn tại hay không do service tra bảng permissions. */
export const PermissionCodeSchema = z.string().trim().max(60).regex(/^[a-z][a-z_]*:[a-z_]+$/, 'validation.permission_code_format');

export const RoleSchema = z.object({
  id: z.uuid(),
  code: RoleCodeSchema,
  name: z.string(),
  description: z.string().nullable(),
  isSystem: z.boolean(),
  permissions: z.array(z.string()),
}).meta({ id: 'Role' });
export type Role = z.infer<typeof RoleSchema>;

/** POST /admin/roles. */
export const CreateRoleSchema = z.object({
  code: RoleCodeSchema,
  name: zText(ROLE_NAME_MAX),
  description: zText(200).nullable().optional(),
  permissions: z.array(PermissionCodeSchema).default([]),
}).meta({ id: 'CreateRole' });
export type CreateRole = z.infer<typeof CreateRoleSchema>;

/** PUT /admin/roles/:id — code không đổi (định danh). */
export const UpdateRoleSchema = CreateRoleSchema.omit({ code: true }).meta({ id: 'UpdateRole' });
export type UpdateRole = z.infer<typeof UpdateRoleSchema>;

/** Response của GET/PUT /admin/users/:id/roles. */
export const UserRolesSchema = z.object({ id: z.uuid(), roles: z.array(RoleCodeSchema) }).meta({ id: 'UserRoles' });
export type UserRoles = z.infer<typeof UserRolesSchema>;

export const SetUserRolesSchema = z.object({
  roles: z.array(RoleCodeSchema).min(1).max(20),
}).meta({ id: 'SetUserRoles' });
export type SetUserRoles = z.infer<typeof SetUserRolesSchema>;
