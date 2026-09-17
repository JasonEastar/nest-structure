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
import { UserModule } from '../user/user.module.js';

/** Bull Board /admin/queues (công cụ ops). Mount ngoài Nest pipeline nên tự kiểm token + quyền queue:read. Tắt khi test. */
export const QUEUE_BOARD_ROUTE = '/admin/queues';
const QUEUE_BOARD_PERMISSION = 'queue:read';
const enabled = (env: NodeJS.ProcessEnv) => env.NODE_ENV !== 'test';

const COOKIE = 'c9_board_token';

/** Đọc một cookie từ header. */
function cookieOf(req: Request, name: string): string | undefined {
  const pair = (req.headers.cookie ?? '').split(';').map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : undefined;
}

/** Token: Bearer → ?access_token= (mở trang) → cookie. Mở bằng query thì đặt cookie vì UI gọi API không kèm query. */
export function queueBoardAuth(jwt: SupabaseJwtService, users: AuthUserPort) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const deny = (code: 'UNAUTHENTICATED' | 'FORBIDDEN'): void => {
      res.status(ErrorCodes[code]).json({ error: { code, message: code, params: {}, requestId: requestIdOf(req) } });
    };
    const [scheme, bearer] = (req.header('authorization') ?? '').split(' ');
    const fromQuery = typeof req.query.access_token === 'string' ? req.query.access_token : undefined;
    const token = (scheme?.toLowerCase() === 'bearer' && bearer) || fromQuery || cookieOf(req, COOKIE);
    if (!token) return deny('UNAUTHENTICATED');
    try {
      const claims = await jwt.verify(token);
      const permissions = await users.getPermissions(claims.sub);
      if (!permissions.includes(QUEUE_BOARD_PERMISSION)) return deny('FORBIDDEN');
      if (fromQuery) {
        res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=${QUEUE_BOARD_ROUTE}; HttpOnly; SameSite=Lax; Max-Age=3600`);
      }
      next();
    } catch {
      deny('UNAUTHENTICATED');
    }
  };
}

const root = BullBoardModule.forRootAsync({
  imports: [UserModule],
  inject: [SupabaseJwtService, AUTH_USER],
  useFactory: (jwt: SupabaseJwtService, users: AuthUserPort) => ({
    route: QUEUE_BOARD_ROUTE,
    adapter: ExpressAdapter,
    boardOptions: { uiConfig: { boardTitle: 'C9 Map queues' } },
    middleware: queueBoardAuth(jwt, users),
  }),
});
const queueNames = Object.values(QUEUES) as string[];
const queues = BullBoardModule.forFeature(...queueNames.map((name) => ({ name, adapter: BullMQAdapter })));

@Module({
  imports: [ConditionalModule.registerWhen(root, enabled), ...(queueNames.length ? [ConditionalModule.registerWhen(queues, enabled)] : [])],
})
export class QueueBoardModule {}
