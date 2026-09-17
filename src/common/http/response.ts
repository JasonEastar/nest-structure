import { type CallHandler, type ExecutionContext, Injectable, type NestInterceptor, StreamableFile } from '@nestjs/common';
import type { Request, Response } from 'express';
import { I18nContext } from 'nestjs-i18n';
import { DEFAULT_LOCALE } from '../../config/i18n.js';
import { type Observable, map } from 'rxjs';
import { requestIdOf } from './request-context.middleware.js';

/**
 * Bọc mọi response thành công thành `{ data, meta: { requestId } }` (APP_INTERCEPTOR).
 * Controller chỉ return dữ liệu thuần; client luôn đọc `body.data`. Lỗi có shape riêng ở exceptions.ts.
 * Endpoint list trả `withMeta(rows, { nextCursor })` (qua pagination.ts `pageOf`) → meta có thêm nextCursor.
 */
export interface PageMeta {
  nextCursor?: string | null;
}
export interface Envelope<T> {
  data: T;
  meta: PageMeta & { requestId: string };
}

const ENVELOPE: unique symbol = Symbol('envelope');
export type PartialEnvelope<T> = { data: T; meta: PageMeta; [ENVELOPE]: true };

/** Handler trả kèm meta (nextCursor); requestId do interceptor gắn, handler không đặt được. */
export const withMeta = <T>(data: T, meta: PageMeta): PartialEnvelope<T> => ({ data, meta, [ENVELOPE]: true });

const isPartialEnvelope = (v: unknown): v is PartialEnvelope<unknown> =>
  typeof v === 'object' && v !== null && (v as Record<symbol, unknown>)[ENVELOPE] === true;

/** Route không bọc: health (Terminus có body riêng), Swagger UI, Bull Board. */
const SKIP_PREFIXES = ['/health', '/docs', '/admin/queues'];

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    if (SKIP_PREFIXES.some((p) => req.path.startsWith(p))) return next.handle();

    const requestId = requestIdOf(req);
    // Client biết response này ở ngôn ngữ nào (cùng cách chọn với message lỗi: ?lang → Accept-Language → vi)
    context.switchToHttp().getResponse<Response>().setHeader('Content-Language', I18nContext.current(context)?.lang ?? DEFAULT_LOCALE);
    return next.handle().pipe(
      map((body: unknown): unknown => {
        if (body instanceof StreamableFile) return body; // tải file: không bọc
        if (isPartialEnvelope(body)) return { data: body.data, meta: { ...body.meta, requestId } } satisfies Envelope<unknown>;
        return { data: body ?? null, meta: { requestId } } satisfies Envelope<unknown>;
      }),
    );
  }
}
