/**
 * Chính sách rate limit của cả app (hằng số, không phải env: dev và prod giống nhau, đổi thì qua code review). Đếm ở common/redis/throttler.guard.ts.
 * Đếm theo IP, mỗi route một bộ đếm, chung mọi instance qua Redis. Route riêng đè bằng `@Throttle({ short: { limit, ttl } })`.
 * Test: trần mặc định mở rất cao để test nghiệp vụ bắn nhanh không bị 429; test rate limit khai `@Throttle` riêng trên route probe.
 */
export const RATE_LIMIT = {
  short: { limit: 10, ttl: 1_000 }, // 10 request / giây
  long: { limit: 300, ttl: 60_000 }, // 300 request / phút (app bản đồ gọi viewport liên tục)
} as const;

export const RATE_LIMIT_TEST = {
  short: { limit: 100_000, ttl: 1_000 },
  long: { limit: 1_000_000, ttl: 60_000 },
} as const;
