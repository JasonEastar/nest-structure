import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor, StreamableFile } from '@nestjs/common';
import type { Request } from 'express';
import { type Observable, map } from 'rxjs';
import { requestIdOf } from './request-context.middleware.js';

/**
 * Hình dạng DUY NHẤT của mọi response (thành công lẫn lỗi) — 5 field, luôn có đủ:
 *   { success, code, msg, data, meta }
 * Thành công: success=true, code='OK', msg='', data = dữ liệu.
 * Lỗi:        success=false, code = mã lỗi (ErrorCodes), msg = câu đã dịch, data = null; chi tiết lỗi nằm trong meta.
 * meta luôn có requestId; thêm nextCursor ở endpoint list, thêm chi tiết lỗi (issues, reason…) khi lỗi.
 */
export interface ApiResponse<T> {
  success: boolean;
  code: string;
  msg: string;
  data: T | null;
  meta: { requestId: string } & Record<string, unknown>;
}

/** Mã của response thành công (chỗ để sau này thêm mã nghiệp vụ nếu cần). */
export const OK = 'OK';

/** Route không bọc: health (Terminus có body riêng), Swagger UI, Bull Board. */
const SKIP_PREFIXES = ['/health', '/docs', '/admin/queues'];

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  /** Bỏ qua route trong SKIP_PREFIXES; còn lại bọc kết quả handler thành ApiResponse. */
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    if (SKIP_PREFIXES.some((p) => req.path.startsWith(p))) return next.handle();

    const requestId = requestIdOf(req);
    return next.handle().pipe(
      map((body: unknown): unknown => {
        if (body instanceof StreamableFile) return body; // tải file: không bọc
        const page = asPage(body);
        return {
          success: true,
          code: OK,
          msg: '',
          data: page ? page.data : (body ?? null),
          meta: { ...page?.meta, requestId },
        } satisfies ApiResponse<unknown>;
      }),
    );
  }
}

/** Handler đã trả sẵn { data, meta } (từ pageOf) thì giữ meta đó và thêm requestId. */
function asPage(body: unknown): { data: unknown; meta: Record<string, unknown> } | undefined {
  return typeof body === 'object' && body !== null && 'data' in body && 'meta' in body
    ? (body as { data: unknown; meta: Record<string, unknown> })
    : undefined;
}
