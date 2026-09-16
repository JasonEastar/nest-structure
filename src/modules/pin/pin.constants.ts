/**
 * Hằng số nghiệp vụ của pin (project-overview-pdr.md §5, §8). Mobile đọc cùng số qua OpenAPI/response.
 * Options scheduler cũng ở đây: N instance cùng upsert, phải giống hệt nhau (ADR-0006 §6).
 */
export const PIN_TTL_MINUTES = {
  traffic_jam: 30,
  flooding: 180,
  night_market: 240,
  event: 180,
  street_food: 180,
  outage: 240,
  scenic: 90,
  fishing: 180,
} as const;
export type PinType = keyof typeof PIN_TTL_MINUTES | 'landmark' | 'sos' | 'promoted' | 'for_sale';

export const PIN_RATE_LIMITS = {
  createIntervalSeconds: 120, // 1 pin / 2 phút / user
  sameTypeRadiusMeters: 300, // 3 pin cùng loại / 300 m / giờ
  sameTypePerHour: 3,
  dailyByTier: { low: 5, mid: 15, high: Number.POSITIVE_INFINITY },
} as const;

export const REP_TIERS = { low: 40, high: 80 } as const; // < 40 pending · 40–79 thường · ≥ 80 live ngay

/** Job định kỳ: hết hạn pin Live. Id cố định → mọi instance upsert cùng một scheduler. */
export const MARKER_EXPIRE_JOB = {
  schedulerId: 'marker-expire',
  jobName: 'expire',
  pattern: '* * * * *', // mỗi phút
  tz: 'Asia/Ho_Chi_Minh',
} as const;
