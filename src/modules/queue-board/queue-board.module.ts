import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { BullBoardModule } from '@bull-board/nestjs';
import { Module } from '@nestjs/common';
import { ConditionalModule } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { AUTH_USER, type AuthUserPort } from '../../common/auth/auth.guard.js';
import { SupabaseJwtService } from '../../common/auth/supabase.js';
import { ErrorCodes } from '../../common/http/exceptions.js';
import { requestIdOf } from '../../common/http/request-context.middleware.js';
import { QUEUES } from '../../common/redis/queue.js';
import { IdentityModule } from '../identity/identity.module.js';

/**
 * Giao diện xem hàng đợi BullMQ (queue depth, job lỗi, retry) tại /admin/queues — công cụ vận hành, không phải API app.
 * Bull Board mount như Express middleware nên guard của Nest KHÔNG chạy → tự kiểm Bearer token + permission `queue:read`
 * bằng tuỳ chọn `middleware` chính thức của @bull-board/nestjs. Tắt khi NODE_ENV=test.
 */
export const QUEUE_BOARD_ROUTE = '/admin/queues';
const QUEUE_BOARD_PERMISSION = 'queue:read';
const enabled = (env: NodeJS.ProcessEnv) => env.NODE_ENV !== 'test';

/** Middleware xác thực: Bearer (UI gọi API bằng fetch) hoặc `?access_token=` (mở bằng trình duyệt). */
export function queueBoardAuth(jwt: SupabaseJwtService, users: AuthUserPort) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const deny = (code: 'UNAUTHENTICATED' | 'FORBIDDEN'): void => {
      // Ngoài Nest pipeline (không qua filter) → tự ghi body cùng shape ErrorEnvelope; công cụ ops nên message tiếng Anh cố định
      res.status(ErrorCodes[code]).json({ error: { code, message: code, params: {}, requestId: requestIdOf(req) } });
    };
    const [scheme, bearer] = (req.header('authorization') ?? '').split(' ');
    const token = scheme?.toLowerCase() === 'bearer' ? bearer : (req.query.access_token as string | undefined);
    if (!token) return deny('UNAUTHENTICATED');
    try {
      const claims = await jwt.verify(token);
      const permissions = await users.getPermissions(claims.sub);
      if (!permissions.includes(QUEUE_BOARD_PERMISSION)) return deny('FORBIDDEN');
      next();
    } catch {
      deny('UNAUTHENTICATED');
    }
  };
}

const root = BullBoardModule.forRootAsync({
  imports: [IdentityModule],
  inject: [SupabaseJwtService, AUTH_USER],
  useFactory: (jwt: SupabaseJwtService, users: AuthUserPort) => ({
    route: QUEUE_BOARD_ROUTE,
    adapter: ExpressAdapter,
    boardOptions: { uiConfig: { boardTitle: 'C9 Map queues' } },
    middleware: queueBoardAuth(jwt, users),
  }),
});
const queues = BullBoardModule.forFeature(...Object.values(QUEUES).map((name) => ({ name, adapter: BullMQAdapter })));

@Module({
  imports: [ConditionalModule.registerWhen(root, enabled), ConditionalModule.registerWhen(queues, enabled)],
})
export class QueueBoardModule {}
