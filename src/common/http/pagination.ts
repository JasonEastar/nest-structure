import { z } from 'zod';
import { AppException } from './exceptions.js';

/** Phân trang cursor (created_at, id), không OFFSET. Mẫu dùng: LocationService.list. */
export const CursorSchema = z.object({ createdAt: z.iso.datetime(), id: z.uuid() });
export type Cursor = z.infer<typeof CursorSchema>;

export const PaginationQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
}); // không meta id: query phải inline để Swagger tách thành tham số
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

/** (createdAt, id) → chuỗi base64url gửi cho client làm `nextCursor`. */
export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

/** Cursor hỏng/giả → 400 BAD_REQUEST (field cursor) (không im lặng trả từ đầu, không 500). */
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

/** Repository lấy `limit + 1` dòng; hàm này cắt về `limit` và tính nextCursor từ dòng cuối (ResponseInterceptor thêm requestId). */
export function pageOf<T>(rows: T[], limit: number, toCursor: (row: T) => Cursor) {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data.at(-1);
  return { data, meta: { nextCursor: hasMore && last ? encodeCursor(toCursor(last)) : null } };
}
