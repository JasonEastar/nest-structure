import { Injectable, type NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import type { Env } from '../config/env.js';

/**
 * Gắn ngữ cảnh instance lên mọi response.
 * - X-Instance-Id: instance nào phục vụ request (kiểm tra load balancing).
 * - X-Request-Id: echo id do nginx sinh (phase 04 mở rộng: sinh uuidv7 khi thiếu + gắn vào log).
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly config: ConfigService<Env, true>) {}

  use(req: Request, res: Response, next: NextFunction): void {
    res.setHeader('X-Instance-Id', this.config.get('INSTANCE_ID', { infer: true }));
    const requestId = req.header('x-request-id');
    if (requestId) {
      res.setHeader('X-Request-Id', requestId);
    }
    next();
  }
}
