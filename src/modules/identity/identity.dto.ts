import { z } from 'zod';

/** DTO của module identity (zod, dùng trực tiếp trên `@Body({ schema })` — Swagger tự đọc). */

export const ROLE_CODES = ['user', 'moderator', 'venue', 'admin'] as const;
export const RoleCodeSchema = z.enum(ROLE_CODES);
export type RoleCode = z.infer<typeof RoleCodeSchema>;

export const MeResponseSchema = z.object({
  id: z.uuid(),
  email: z.email().nullable(),
  displayName: z.string(),
  username: z.string().nullable(),
  avatarUrl: z.url().nullable(),
  locale: z.string(),
  homeCityCode: z.string().nullable(),
  phoneVerified: z.boolean(),
  roles: z.array(RoleCodeSchema),
  permissions: z.array(z.string()),
});
export type MeResponse = z.infer<typeof MeResponseSchema>;

export const SetUserRolesSchema = z.object({
  roles: z.array(RoleCodeSchema).min(1).max(ROLE_CODES.length),
});
export type SetUserRoles = z.infer<typeof SetUserRolesSchema>;

export const RoleSchema = z.object({
  code: RoleCodeSchema,
  name: z.string(),
  permissions: z.array(z.string()),
});
export type Role = z.infer<typeof RoleSchema>;
