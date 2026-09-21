/** req.user do AuthGuard gắn. req.id đã có từ pino-http, đọc qua requestIdOf(). */
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email?: string | null };
    }
  }
}
export {};
