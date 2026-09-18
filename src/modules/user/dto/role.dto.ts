import { z } from 'zod';

/** DTO role/RBAC (zod, dùng trực tiếp trên `@Body({ schema })` — Swagger tự đọc). */

export const ROLE_CODES = ['user', 'moderator', 'venue', 'admin'] as const;
export const RoleCodeSchema = z.enum(ROLE_CODES);
export type RoleCode = z.infer<typeof RoleCodeSchema>;

export const RoleSchema = z.object({
  code: RoleCodeSchema,
  name: z.string(),
  permissions: z.array(z.string()),
}).meta({ id: 'Role' });
export type Role = z.infer<typeof RoleSchema>;

/** Response của GET/PUT /admin/users/:id/roles. */
export const UserRolesSchema = z.object({ id: z.uuid(), roles: z.array(RoleCodeSchema) }).meta({ id: 'UserRoles' });
export type UserRoles = z.infer<typeof UserRolesSchema>;

export const SetUserRolesSchema = z.object({
  roles: z.array(RoleCodeSchema).min(1).max(ROLE_CODES.length),
}).meta({ id: 'SetUserRoles' });
export type SetUserRoles = z.infer<typeof SetUserRolesSchema>;
