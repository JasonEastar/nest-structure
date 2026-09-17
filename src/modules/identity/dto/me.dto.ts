import { z } from 'zod';
import { RoleCodeSchema } from './role.dto.js';

/** DTO /me — hồ sơ người dùng đang đăng nhập. */
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
