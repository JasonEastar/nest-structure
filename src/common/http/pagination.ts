import { z } from 'zod';
import { AppException } from './exceptions.js';
import { type PartialEnvelope, withMeta } from './response.js';

/**
 * Phân trang bằng cursor (created_at, id) — không OFFSET (code-standards §2.3).
 * Cách dùng trong controller/service:
 *   const q = PaginationQuerySchema.parse(query)  // hoặc @Query({ schema: PaginationQuerySchema })
 *   const rows = await repo.findPage(userId, q.limit + 1, decodeCursor(q.cursor))
 *   return pageOf(rows, q.limit, (r) => ({ createdAt: r.createdAt.toISOString(), id: r.id }))
 */
export const CursorSchema = z.object({ createdAt: z.iso.datetime(), id: z.uuid() });
export type Cursor = z.infer<typeof CursorSchema>;

export const PaginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}); // không meta id: query phải inline để Swagger tách thành tham số
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

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

/** Repository lấy `limit + 1` dòng; hàm này cắt về `limit` và tính nextCursor từ dòng cuối. */
export function pageOf<T>(rows: T[], limit: number, toCursor: (row: T) => Cursor): PartialEnvelope<T[]> {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data.at(-1);
  return withMeta(data, { nextCursor: hasMore && last ? encodeCursor(toCursor(last)) : null });
}
