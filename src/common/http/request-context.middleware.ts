import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { uuidv7 } from 'uuidv7';

/** X-Request-Id cho mọi request (giữ id client/proxy gửi, không có thì sinh uuid v7); chạy trước guard. */
const REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

type RequestWithId = { id?: unknown; headers: Record<string, string | string[] | undefined> };

/** req.id → string, rỗng nếu chưa có. */
export const requestIdOf = (req: { id?: unknown }): string => (typeof req.id === 'string' ? req.id : '');

/** Trả req.id nếu đã có; không thì lấy header hợp lệ hoặc sinh mới. Dùng bởi pino và middleware. */
export function resolveRequestId(req: RequestWithId): string {
  const existing = requestIdOf(req);
  if (existing) return existing;
  const raw = req.headers['x-request-id'];
  const incoming = Array.isArray(raw) ? raw[0] : raw;
  const id = incoming && REQUEST_ID.test(incoming) ? incoming : uuidv7();
  req.id = id;
  return id;
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  /** Gắn request id lên req và trả header cho client. */
  use(req: Request, res: Response, next: NextFunction): void {
    res.setHeader('X-Request-Id', resolveRequestId(req));
    next();
  }
}
