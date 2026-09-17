import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { BullBoardModule } from '@bull-board/nestjs';
import type { NextFunction, Request, Response } from 'express';
import type { AuthUserPort } from '../auth/auth.guard.js';
import { ErrorCodes } from '../http/exceptions.js';
import { QUEUES } from './queue.js';
import { requestIdOf } from '../http/request-context.middleware.js';
import type { SupabaseJwtService } from '../auth/supabase.js';

/**
 * Bull Board tại /admin/queues (queue depth, job lỗi, retry).
 * Bull Board mount như Express middleware nên guard của Nest KHÔNG chạy → dùng tuỳ chọn `middleware` chính thức
 * của @bull-board/nestjs (áp TRƯỚC router): Bearer token Supabase + permission `queue:read`, lỗi theo shape dự án.
 * Wiring (forRootAsync + inject) nằm ở app.module.ts vì cần AUTH_USER từ IdentityModule.
 */
export const BULL_BOARD_ROUTE = '/admin/queues';
export const BULL_BOARD_PERMISSION = 'queue:read';

export const bullBoardRootOptions = (middleware: ReturnType<typeof createBullBoardAuth>) => ({
  route: BULL_BOARD_ROUTE,
  adapter: ExpressAdapter,
  boardOptions: { uiConfig: { boardTitle: 'C9 Map queues' } },
  middleware,
});

export const BullBoardQueuesModule = BullBoardModule.forFeature(
  ...Object.values(QUEUES).map((name) => ({ name, adapter: BullMQAdapter })),
);

/** Middleware hàm (Bull Board nhận qua `options.middleware`); dependency được inject bởi factory ở app.module.ts. */
export function createBullBoardAuth(jwt: SupabaseJwtService, users: AuthUserPort) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requestId = requestIdOf(req);
    const deny = (code: 'UNAUTHENTICATED' | 'FORBIDDEN'): void => {
      res.status(ErrorCodes[code]).json({ error: { code, params: {}, requestId } });
    };
    // UI gọi API bằng fetch có Authorization; cho phép ?access_token= để mở bằng trình duyệt.
    const [scheme, bearer] = (req.header('authorization') ?? '').split(' ');
    const token = scheme?.toLowerCase() === 'bearer' ? bearer : (req.query.access_token as string | undefined);
    if (!token) {
      deny('UNAUTHENTICATED');
      return;
    }
    try {
      const claims = await jwt.verify(token);
      const permissions = await users.getPermissions(claims.sub);
      if (!permissions.includes(BULL_BOARD_PERMISSION)) {
        deny('FORBIDDEN');
        return;
      }
      next();
    } catch {
      deny('UNAUTHENTICATED');
    }
  };
}
