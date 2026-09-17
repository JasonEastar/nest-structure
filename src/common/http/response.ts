import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor, StreamableFile } from '@nestjs/common';
import type { Request } from 'express';
import { type Observable, map } from 'rxjs';
import { requestIdOf } from './request-context.middleware.js';

/**
 * Bọc mọi response thành công thành `{ data, meta: { requestId } }` (APP_INTERCEPTOR).
 * Controller chỉ return dữ liệu thuần; client luôn đọc `body.data`. Lỗi có shape riêng ở exceptions.ts.
 * Phân trang (cursor, nextCursor trong meta) thêm ở bước pin core khi có endpoint list đầu tiên.
 */
export interface Envelope<T> {
  data: T;
  meta: { requestId: string };
}

/** Route không bọc: health (Terminus có body riêng), Swagger UI, Bull Board. */
const SKIP_PREFIXES = ['/health', '/docs', '/admin/queues'];

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    if (SKIP_PREFIXES.some((p) => req.path.startsWith(p))) return next.handle();

    const requestId = requestIdOf(req);
    return next.handle().pipe(
      map((body: unknown): unknown => {
        if (body instanceof StreamableFile) return body; // tải file: không bọc
        return { data: body ?? null, meta: { requestId } } satisfies Envelope<unknown>;
      }),
    );
  }
}
