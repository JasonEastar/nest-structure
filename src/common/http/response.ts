import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor, StreamableFile } from '@nestjs/common';
import type { Request } from 'express';
import { type Observable, map } from 'rxjs';
import { requestIdOf } from './request-context.middleware.js';

/**
 * Bọc mọi response thành công thành { data, meta: { requestId, nextCursor? } }.
 * Controller/service trả dữ liệu thuần; endpoint list trả sẵn { data, meta } (xem pageOf) thì chỉ thêm requestId.
 */
export interface Envelope<T> {
  data: T;
  meta: { requestId: string; nextCursor?: string | null };
}

/** Route không bọc: health (Terminus có body riêng), Swagger UI, Bull Board. */
const SKIP_PREFIXES = ['/health', '/docs', '/admin/queues'];

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  /** Bỏ qua route trong SKIP_PREFIXES; còn lại bọc kết quả handler thành envelope. */
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    if (SKIP_PREFIXES.some((p) => req.path.startsWith(p))) return next.handle();

    const requestId = requestIdOf(req);
    return next.handle().pipe(
      map((body: unknown): unknown => {
        if (body instanceof StreamableFile) return body; // tải file: không bọc
        if (isPage(body)) return { data: body.data, meta: { ...body.meta, requestId } };
        return { data: body ?? null, meta: { requestId } };
      }),
    );
  }
}

/** Handler đã trả sẵn { data, meta } (từ pageOf) thì giữ meta đó và thêm requestId. */
function isPage(body: unknown): body is { data: unknown; meta: Record<string, unknown> } {
  return typeof body === 'object' && body !== null && 'data' in body && 'meta' in body;
}
