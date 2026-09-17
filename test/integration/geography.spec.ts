import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { ewkbToLatLng, latLngToEwkt, type LatLng } from '../../src/common/database/drizzle.js';

/**
 * Kiểm chứng customType geography(Point,4326) trên PostGIS thật (testcontainers qua globalSetup):
 * - latLngToEwkt (toDriver) → PostGIS nhận đúng SRID/toạ độ.
 * - ewkbToLatLng (fromDriver) parse EWKB hex → lat/lng khớp.
 * - ST_DWithin theo mét dùng được với giá trị đã ghi.
 */
describe('geographyPoint customType (PostGIS)', () => {
  const client = postgres(process.env.DATABASE_URL!, { max: 1, onnotice: () => {} });
  const db = drizzle(client);
  const table = sql.identifier('_geo_probe');

  beforeAll(async () => {
    await db.execute(sql`create temp table ${table} (id int primary key, loc geography(Point,4326))`);
  });
  afterAll(async () => {
    await client.end({ timeout: 2 });
  });

  it('ghi bằng toDriver rồi đọc lại bằng fromDriver ra đúng lat/lng', async () => {
    const notreDame: LatLng = { lat: 10.7798, lng: 106.699 };
    const encoded = latLngToEwkt(notreDame);
    expect(encoded).toBe('SRID=4326;POINT(106.699 10.7798)');

    await db.execute(sql`insert into ${table} (id, loc) values (1, ${encoded}::geography)`);
    const rows = await db.execute<{ loc: string; lng: number; lat: number }>(
      sql`select loc::text as loc, ST_X(loc::geometry) as lng, ST_Y(loc::geometry) as lat from ${table} where id = 1`,
    );
    const row = rows[0]!;
    expect(row.lng).toBeCloseTo(106.699, 6);
    expect(row.lat).toBeCloseTo(10.7798, 6);

    const decoded = ewkbToLatLng(row.loc);
    expect(decoded.lng).toBeCloseTo(106.699, 6);
    expect(decoded.lat).toBeCloseTo(10.7798, 6);
  });

  it('ST_DWithin theo mét: điểm cách ~150 m nằm trong 200 m, ngoài 100 m', async () => {
    // Bưu điện TP cách Nhà thờ Đức Bà ~150 m
    const post = latLngToEwkt({ lat: 10.7799, lng: 106.7003 });
    const rows = await db.execute<{ within200: boolean; within100: boolean; d: number }>(
      sql`select ST_DWithin(loc, ${post}::geography, 200) as "within200",
                 ST_DWithin(loc, ${post}::geography, 100) as "within100",
                 ST_Distance(loc, ${post}::geography) as d
          from ${table} where id = 1`,
    );
    const r = rows[0]!;
    expect(r.within200).toBe(true);
    expect(r.within100).toBe(false);
    expect(r.d).toBeGreaterThan(100);
    expect(r.d).toBeLessThan(200);
  });
});
