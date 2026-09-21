/** Hằng số nghiệp vụ của user (zod enum và /public/configs dùng chung các mảng này). */
export const ROLE_CODES = ['user', 'moderator', 'venue', 'admin'] as const;
export const USER_STATUSES = ['active', 'blocked'] as const;

export const USER_LIMITS = {
  displayName: { min: 2, max: 50 },
  homeCityCode: { max: 10 },
} as const;

export const PASSWORD_LENGTH = { min: 8, max: 72 } as const; // 72 = giới hạn bcrypt của Supabase; policy mạnh hơn đặt ở Dashboard
