import { ROLE_CODES } from '../user/dto/role.dto.js';
import { USER_STATUSES } from '../user/user.constants.js';

/**
 * Config công khai cho web/app gọi một lần lúc mở (GET /public/configs?names=...).
 * `system_enums`: enum sinh từ CODE (cùng mảng zod đang validate nên không lệch), nhãn từ `i18n/<lang>/enums.json`
 * theo đường dẫn `enums.<key>.<code>` (key `user.status` → `enums.user.status.active`). Sort = thứ tự trong mảng.
 * Config lưu DB do admin sửa (support_bank...) thêm sau, cùng shape `{ name, data }`.
 */
export const CONFIG_NAMES = ['system_enums'] as const;
export type ConfigName = (typeof CONFIG_NAMES)[number];

export interface EnumDef {
  key: string; // `<resource>.<field>`
  codes: readonly string[];
  colors?: Record<string, string>; // màu gợi ý cho UI (hex)
}

export const SYSTEM_ENUMS: EnumDef[] = [
  { key: 'user.status', codes: USER_STATUSES, colors: { active: '#22c55e', blocked: '#ef4444' } },
  { key: 'role.code', codes: ROLE_CODES, colors: { admin: '#a855f7', moderator: '#3b82f6', venue: '#f59e0b', user: '#6b7280' } },
];
