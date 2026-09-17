import { AppException } from '../../src/common/http/exceptions.js';
import { PaginationQuerySchema, decodeCursor, encodeCursor, pageOf } from '../../src/common/http/pagination.js';

describe('cursor phân trang', () => {
  const cursor = { createdAt: '2026-09-16T10:00:00.000Z', id: '0199aaaa-0000-7000-8000-000000000001' };

  it('encode → decode round-trip, base64url không có ký tự cần escape', () => {
    const raw = encodeCursor(cursor);
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(raw)).toEqual(cursor);
  });

  it('rỗng → undefined; hỏng (không base64, không JSON, sai shape) → 400 BAD_REQUEST', () => {
    expect(decodeCursor(undefined)).toBeUndefined();
    expect(decodeCursor('')).toBeUndefined();
    for (const bad of ['!!!', Buffer.from('not json').toString('base64url'), Buffer.from('{"a":1}').toString('base64url')]) {
      expect(() => decodeCursor(bad)).toThrow(AppException);
      try {
        decodeCursor(bad);
      } catch (e) {
        expect((e as AppException).code).toBe('BAD_REQUEST');
        expect((e as AppException).params).toEqual({ field: 'cursor' });
      }
    }
  });

  it('PaginationQuerySchema: limit mặc định 20, tối đa 100, coerce từ string', () => {
    expect(PaginationQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(PaginationQuerySchema.parse({ limit: '50' }).limit).toBe(50);
    expect(PaginationQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(PaginationQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
  });

  it('pageOf: limit+1 dòng → cắt còn limit và nextCursor từ dòng cuối; đúng limit → nextCursor null', () => {
    const rows = [1, 2, 3].map((n) => ({ id: `0199aaaa-0000-7000-8000-00000000000${n}`, createdAt: `2026-09-16T10:00:0${n}.000Z` }));
    const toCursor = (r: (typeof rows)[number]) => ({ createdAt: r.createdAt, id: r.id });

    const more = pageOf(rows, 2, toCursor);
    expect(more.data).toEqual(rows.slice(0, 2));
    expect(decodeCursor(more.meta.nextCursor!)).toEqual(toCursor(rows[1]!));

    const last = pageOf(rows.slice(0, 2), 2, toCursor);
    expect(last.data).toHaveLength(2);
    expect(last.meta.nextCursor).toBeNull();
    expect(pageOf([], 2, toCursor)).toMatchObject({ data: [], meta: { nextCursor: null } });
  });
});
