import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import type { Request } from 'express';
import { type Observable, map } from 'rxjs';
import { z } from 'zod';
import { AppException } from './exceptions.js';
import { requestIdOf } from './request-context.middleware.js';

/**
 * Envelope thành công: `{ data, meta: { requestId, ...pagination? } }`.
 * Handler trả `data` thuần hoặc `{ data, meta }` (khi có cursor); interceptor bọc phần còn lại.
 */
export interface PageMeta {
  nextCursor?: string | null;
  total?: number;
}
export interface Meta extends PageMeta {
  requestId: string;
}
export interface Envelope<T> {
  data: T;
  meta: Meta;
}

const ENVELOPE = Symbol('envelope');
type PartialEnvelope<T> = { data: T; meta: PageMeta; [ENVELOPE]: true };

/** Handler trả kèm meta phân trang (nextCursor, total); requestId do interceptor gắn, handler không đặt được. */
export const withMeta = <T>(data: T, meta: PageMeta): PartialEnvelope<T> => ({ data, meta, [ENVELOPE]: true });

const SKIP_PREFIXES = ['/health', '/docs', '/admin/queues'];

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    if (SKIP_PREFIXES.some((p) => req.path.startsWith(p))) {
      return next.handle();
    }
    const requestId = requestIdOf(req);
    return next.handle().pipe(
      map((body: unknown) => {
        if (body instanceof StreamableFile) return body;
        if (isPartialEnvelope(body)) {
          return { data: body.data, meta: { ...body.meta, requestId } } satisfies Envelope<unknown>;
        }
        return { data: body ?? null, meta: { requestId } } satisfies Envelope<unknown>;
      }),
    );
  }
}

function isPartialEnvelope(v: unknown): v is PartialEnvelope<unknown> {
  return typeof v === 'object' && v !== null && (v as Record<symbol, unknown>)[ENVELOPE] === true;
}

/** Cursor phân trang: (created_at, id) → base64url. Không OFFSET (code-standards §2.3). */
export const CursorSchema = z.object({ createdAt: z.iso.datetime(), id: z.uuid() });
export type Cursor = z.infer<typeof CursorSchema>;

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

/** Cursor hỏng/giả → 400 BAD_REQUEST (không im lặng trả từ đầu, không 500). */
export function decodeCursor(raw: string | undefined): Cursor | undefined {
  if (!raw) return undefined;
  try {
    const parsed = CursorSchema.safeParse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')));
    if (parsed.success) return parsed.data;
  } catch {
    // rơi xuống throw bên dưới
  }
  throw new AppException('BAD_REQUEST', { field: 'cursor' });
}

/** Query chuẩn cho list endpoint: `?cursor=&limit=` */
export const PaginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
