import { z } from 'zod';
import { type RoleCode, RoleCodeSchema } from './role.dto.js';

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
}).meta({ id: 'MeResponse' });
export type MeResponse = z.infer<typeof MeResponseSchema>;

/** Profile (row) + role + permission → MeResponse. `phoneVerified` suy từ `phoneVerifiedAt`. */
export function toMeResponse(
  profile: {
    id: string;
    email: string | null;
    displayName: string;
    username: string | null;
    avatarUrl: string | null;
    locale: string;
    homeCityCode: string | null;
    phoneVerifiedAt: Date | null;
  },
  roles: RoleCode[],
  permissions: string[],
): MeResponse {
  return {
    id: profile.id,
    email: profile.email,
    displayName: profile.displayName,
    username: profile.username,
    avatarUrl: profile.avatarUrl,
    locale: profile.locale,
    homeCityCode: profile.homeCityCode,
    phoneVerified: profile.phoneVerifiedAt !== null,
    roles,
    permissions,
  };
}
