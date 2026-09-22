import { z } from 'zod';
import { zText } from '../../../common/http/validation.js';
import { LOCALES } from '../../../config/i18n.js';
import { USER_LIMITS } from '../user.constants.js';

/** PATCH /me: gửi field nào sửa field đó; `null` để xoá avatar / homeCityCode.
 * `username` không sửa được ở đây: là định danh đăng nhập (admin username + password sau này), đặt một lần khi tạo tài khoản. */
export const UpdateMeSchema = z
  .object({
    displayName: zText(USER_LIMITS.displayName.max, USER_LIMITS.displayName.min),
    avatarUrl: z.url().max(500).nullable(),
    locale: z.enum(LOCALES),
    homeCityCode: zText(USER_LIMITS.homeCityCode.max).nullable(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'validation.at_least_one_field')
  .meta({ id: 'UpdateMe' });
export type UpdateMe = z.infer<typeof UpdateMeSchema>;
