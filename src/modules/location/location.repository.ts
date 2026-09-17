import { Injectable } from '@nestjs/common';
import { and, count, desc, eq, lt, or, sql } from 'drizzle-orm';
import { type LatLng, latLngToEwkt } from '../../common/database/columns.js';
import { type Db, InjectDb } from '../../common/database/drizzle.js';
import type { Cursor } from '../../common/http/pagination.js';
import { type SavedLocationRow, savedLocations } from './schema/location.schema.js';

/** Mọi SQL của location ở đây; service chỉ có logic (code-standards §5). Mọi query đều lọc theo userId (dữ liệu riêng tư). */
@Injectable()
export class LocationRepository {
  constructor(@InjectDb() private readonly db: Db) {}

  async insert(userId: string, data: { name: string; point: LatLng; radiusMeters: number }): Promise<SavedLocationRow> {
    const [row] = await this.db.insert(savedLocations).values({ userId, ...data }).returning();
    return row!;
  }

  async countByUser(userId: string): Promise<number> {
    const [row] = await this.db.select({ n: count() }).from(savedLocations).where(eq(savedLocations.userId, userId));
    return row?.n ?? 0;
  }

  /** Trang theo cursor (created_at, id) giảm dần; caller truyền `limit + 1` để biết còn trang sau không. */
  async findPage(userId: string, limit: number, cursor?: Cursor): Promise<SavedLocationRow[]> {
    const afterCursor = cursor
      ? or(
          lt(savedLocations.createdAt, new Date(cursor.createdAt)),
          and(eq(savedLocations.createdAt, new Date(cursor.createdAt)), lt(savedLocations.id, cursor.id)),
        )
      : undefined;
    return this.db
      .select()
      .from(savedLocations)
      .where(and(eq(savedLocations.userId, userId), afterCursor))
      .orderBy(desc(savedLocations.createdAt), desc(savedLocations.id))
      .limit(limit);
  }

  async findById(userId: string, id: string): Promise<SavedLocationRow | null> {
    const [row] = await this.db
      .select()
      .from(savedLocations)
      .where(and(eq(savedLocations.id, id), eq(savedLocations.userId, userId)))
      .limit(1);
    return row ?? null;
  }

  /** Trả true nếu có dòng bị xoá. */
  async deleteById(userId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(savedLocations)
      .where(and(eq(savedLocations.id, id), eq(savedLocations.userId, userId)))
      .returning({ id: savedLocations.id });
    return rows.length > 0;
  }

  /** PostGIS: ST_DWithin trên geography = mét thật; ép `::geography` vì tham số vào là text (columns.ts). */
  async findWithin(userId: string, center: LatLng, meters: number): Promise<(SavedLocationRow & { distanceMeters: number })[]> {
    const centerGeo = sql`${latLngToEwkt(center)}::geography`;
    return this.db
      .select({
        id: savedLocations.id,
        userId: savedLocations.userId,
        name: savedLocations.name,
        point: savedLocations.point,
        radiusMeters: savedLocations.radiusMeters,
        createdAt: savedLocations.createdAt,
        updatedAt: savedLocations.updatedAt,
        distanceMeters: sql<number>`ST_Distance(${savedLocations.point}, ${centerGeo})`.mapWith(Number),
      })
      .from(savedLocations)
      .where(and(eq(savedLocations.userId, userId), sql`ST_DWithin(${savedLocations.point}, ${centerGeo}, ${meters})`))
      .orderBy(sql`ST_Distance(${savedLocations.point}, ${centerGeo})`);
  }
}
