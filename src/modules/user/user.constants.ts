/** Hằng số nghiệp vụ của user. */
export const USER_LIMITS = {
  displayName: { min: 2, max: 50 },
  homeCityCodeMaxLength: 10,
} as const;

export const LOCALES = ['vi', 'en'] as const;
export const USER_STATUSES = ['active', 'blocked'] as const;
export const PASSWORD_LENGTH = { min: 8, max: 72 } as const; // 72 = giới hạn bcrypt của Supabase; policy mạnh hơn đặt ở Dashboard
