import { cacheEntry } from '../../common/redis/cache.js';

/** Hằng số nghiệp vụ của user. Role nằm trong DB (admin quản lý); chỉ 2 role hệ thống được code biết tên. */
export const SYSTEM_ROLE = {
  user: 'user', // gán mặc định khi tạo profile lần đầu
  admin: 'admin', // luôn có MỌI permission (kể cả permission mới thêm), không cần role_permissions
} as const;
export const ROLE_CODE = { min: 2, max: 30, pattern: /^[a-z][a-z0-9_]*$/ } as const;
export const ROLE_NAME_MAX = 50;
export const USER_STATUSES = ['active', 'blocked'] as const;

export const USER_LIMITS = {
  displayName: { min: 2, max: 50 },
  homeCityCode: { max: 10 },
} as const;

export const PASSWORD_LENGTH = { min: 6, max: 72 } as const; // 72 = giới hạn bcrypt của Supabase; policy mạnh hơn đặt ở Dashboard

/** Cache của module user (key `c9:v1:user:<name>:<userId>`). */
export const USER_CACHE = {
  /** `{ status }` của profile → request sau không chạm DB; block/unblock ghi đè ngay nên mọi instance thấy tức thì */
  profile: cacheEntry('user', 'profile', 3600),
  /** Tombstone sau DELETE /me: token còn hạn không làm profile "sống lại". TTL = tuổi thọ token + dư */
  deleted: cacheEntry('user', 'deleted', 3600 + 300),
  /** Quyền hiệu lực (RBAC); đổi role → xoá key này */
  perms: cacheEntry('user', 'perms', 300),
} as const;
