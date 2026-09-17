import { Inject, Injectable, type OnModuleDestroy, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { customType } from 'drizzle-orm/pg-core';
import postgres, { type Sql } from 'postgres';
import type { Env } from '../../config/env.js';
import * as schema from './schema.js';

export { uuidv7 } from 'uuidv7';

/** Drizzle client có kiểu theo toàn bộ schema (barrel `common/database/schema.ts`). */
export type Db = PostgresJsDatabase<typeof schema>;

export const DRIZZLE = Symbol('DRIZZLE');
export const InjectDb = () => Inject(DRIZZLE);

/**
 * `geography(Point, 4326)` — Drizzle 0.45 chỉ có `geometry` built-in.
 * Ghi: { lat, lng } → ST_MakePoint(lng, lat). Đọc: PostGIS trả EWKB hex → parse x/y (little-endian).
 * Index GIST viết tay trong migration SQL.
 */
export type LatLng = { lat: number; lng: number };

export const geographyPoint = customType<{ data: LatLng; driverData: string }>({
  dataType: () => 'geography(Point,4326)',
  toDriver: (value) => latLngToEwkt(value),
  fromDriver: (value) => ewkbToLatLng(value),
});

/**
 * { lat, lng } → EWKT cho cột geography.
 * Hoạt động vì postgres.js gửi tham số string với OID 0 (unspecified) → Postgres suy kiểu từ cột
 * và gọi geography_in(). PostGIS KHÔNG có cast text→geography; trong SQL tay phải viết `${v}::geography`.
 */
export function latLngToEwkt(value: LatLng): string {
  return `SRID=4326;POINT(${value.lng} ${value.lat})`;
}

/** EWKB hex (postgres.js trả cho geography) → { lat, lng }. */
export function ewkbToLatLng(hex: string): LatLng {
  // EWKB: 1 byte endian · 4 byte type (có cờ SRID 0x20000000) · [4 byte SRID] · 8 byte X · 8 byte Y
  const buf = Buffer.from(hex, 'hex');
  const littleEndian = buf[0] === 1;
  const type = littleEndian ? buf.readUInt32LE(1) : buf.readUInt32BE(1);
  const hasSrid = (type & 0x20000000) !== 0;
  const offset = 5 + (hasSrid ? 4 : 0);
  const x = littleEndian ? buf.readDoubleLE(offset) : buf.readDoubleBE(offset);
  const y = littleEndian ? buf.readDoubleLE(offset + 8) : buf.readDoubleBE(offset + 8);
  return { lng: x, lat: y };
}

/** Giữ kết nối postgres.js để đóng pool khi shutdown (worker BullMQ kịp xong job trước). */
@Injectable()
export class DatabaseLifecycle implements OnModuleDestroy {
  constructor(private readonly sql: Sql) {}
  async onModuleDestroy(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }
}

export const POSTGRES_SQL = Symbol('POSTGRES_SQL');

export const databaseProviders: Provider[] = [
  {
    provide: POSTGRES_SQL,
    inject: [ConfigService],
    useFactory: (config: ConfigService<Env, true>): Sql =>
      postgres(config.get('DATABASE_URL', { infer: true }), {
        max: config.get('DB_POOL_MAX', { infer: true }),
        prepare: true, // kết nối trực tiếp, không pooler (ADR-0005)
        onnotice: () => {}, // tắt NOTICE của Postgres trong log
      }),
  },
  {
    provide: DRIZZLE,
    inject: [POSTGRES_SQL],
    useFactory: (sql: Sql): Db => drizzle(sql, { schema, casing: 'snake_case' }),
  },
  {
    provide: DatabaseLifecycle,
    inject: [POSTGRES_SQL],
    useFactory: (sql: Sql) => new DatabaseLifecycle(sql),
  },
];
