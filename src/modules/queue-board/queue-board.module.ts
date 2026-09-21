import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { BullBoardModule } from '@bull-board/nestjs';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { AUTH_USER, type AuthUserPort } from '../../common/auth/auth.guard.js';
import { hasPermission } from '../../common/auth/permissions.js';
import { SupabaseJwtService } from '../../common/auth/supabase.js';
import { AppException, ErrorCodes } from '../../common/http/exceptions.js';
import { requestIdOf } from '../../common/http/request-context.middleware.js';
import { QUEUES } from '../../common/redis/queue.js';
import type { Env } from '../../config/env.js';
import { UserModule } from '../user/user.module.js';

/** Bull Board /admin/queues (công cụ ops). Mount ngoài Nest pipeline nên tự kiểm token + quyền queue:read. */
export const QUEUE_BOARD_ROUTE = '/admin/queues';
const COOKIE = 'c9_board_token';

/** Đọc một cookie từ header. */
function cookieOf(req: Request, name: string): string | undefined {
  const pair = (req.headers.cookie ?? '').split(';').map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : undefined;
}

/** Token: Bearer → ?access_token= (mở trang) → cookie. Mở bằng query thì đặt cookie vì UI gọi API không kèm query.
 * Cùng luật với AuthGuard: ensureProfile chặn user bị khoá / đã xoá, rồi mới kiểm quyền. */
export function queueBoardAuth(jwt: SupabaseJwtService, users: AuthUserPort, secureCookie: boolean) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const deny = (code: 'UNAUTHENTICATED' | 'FORBIDDEN'): void => {
      res.status(ErrorCodes[code]).json({ success: false, code, msg: code, data: null, meta: { requestId: requestIdOf(req) } });
    };
    const [scheme, bearer] = (req.header('authorization') ?? '').split(' ');
    const fromQuery = typeof req.query.access_token === 'string' ? req.query.access_token : undefined;
    const token = (scheme?.toLowerCase() === 'bearer' && bearer) || fromQuery || cookieOf(req, COOKIE);
    if (!token) return deny('UNAUTHENTICATED');
    try {
      const claims = await jwt.verify(token);
      const user = await users.ensureProfile(claims); // ném FORBIDDEN nếu blocked, UNAUTHENTICATED nếu đã xoá
      if (!hasPermission(await users.getPermissions(user.id), 'queue:read')) return deny('FORBIDDEN');
      if (fromQuery) {
        const secure = secureCookie ? '; Secure' : '';
        res.setHeader('Set-Cookie', `${COOKIE}=${encodeURIComponent(token)}; Path=${QUEUE_BOARD_ROUTE}; HttpOnly; SameSite=Lax; Max-Age=3600${secure}`);
      }
      next();
    } catch (error) {
      deny(error instanceof AppException && error.code === 'FORBIDDEN' ? 'FORBIDDEN' : 'UNAUTHENTICATED');
    }
  };
}

const root = BullBoardModule.forRootAsync({
  imports: [UserModule],
  inject: [SupabaseJwtService, AUTH_USER, ConfigService],
  useFactory: (jwt: SupabaseJwtService, users: AuthUserPort, config: ConfigService<Env, true>) => ({
    route: QUEUE_BOARD_ROUTE,
    adapter: ExpressAdapter,
    boardOptions: { uiConfig: { boardTitle: 'C9 Map queues' } },
    middleware: queueBoardAuth(jwt, users, config.get('NODE_ENV', { infer: true }) === 'production'),
  }),
});
const queueNames = Object.values(QUEUES) as string[];

@Module({
  // Chưa có queue thì chỉ mount trang trống
  imports: [root, ...(queueNames.length ? [BullBoardModule.forFeature(...queueNames.map((name) => ({ name, adapter: BullMQAdapter })))] : [])],
})
export class QueueBoardModule {}
