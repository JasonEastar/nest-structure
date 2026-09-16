/**
 * Mở rộng kiểu Express Request dùng chung.
 * `req.id` đã được pino-http khai báo (ReqId = string | number | object) → không khai lại; đọc qua `requestIdOf(req)`.
 * `req.user` do AuthGuard gắn (phase 06).
 */
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email?: string | null; locale?: string };
    }
  }
}
export {};
