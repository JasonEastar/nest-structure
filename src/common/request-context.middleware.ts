import { Injectable, type NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { uuidv7 } from 'uuidv7';
import type { Env } from '../config/env.js';

/**
 * Gắn ngữ cảnh lên mọi request/response (chạy trước guard/pipe/log).
 * - X-Instance-Id: instance nào phục vụ (kiểm tra load balancing).
 * - X-Request-Id: giữ id do nginx sinh; không có (ALB, gọi thẳng) → sinh uuid v7. Gắn vào `req.id` cho pino và filter.
 */
const REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

type RequestWithId = { id?: unknown; headers: Record<string, string | string[] | undefined> };

/** req.id (pino-http khai kiểu rộng) → string, rỗng nếu chưa có. */
export const requestIdOf = (req: { id?: unknown }): string => (typeof req.id === 'string' ? req.id : '');

/** Idempotent: trả req.id nếu đã có; không thì lấy header hợp lệ hoặc sinh uuid v7. Dùng bởi pino (genReqId) và middleware. */
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
  constructor(private readonly config: ConfigService<Env, true>) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const requestId = resolveRequestId(req);
    res.setHeader('X-Request-Id', requestId);
    res.setHeader('X-Instance-Id', this.config.get('INSTANCE_ID', { infer: true }));
    next();
  }
}
