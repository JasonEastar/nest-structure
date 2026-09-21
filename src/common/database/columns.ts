import { customType, timestamp, uuid } from 'drizzle-orm/pg-core';
import { uuidv7 } from 'uuidv7';

/** Cột dùng chung cho *.schema.ts. Chỉ import drizzle-orm + uuidv7 (không import drizzle.ts, tránh vòng). */

/** `created_at` + `updated_at` (updated_at tự cập nhật khi Drizzle update). */
export const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/** Khoá chính uuid v7 sinh phía app (sắp theo thời gian, hợp cursor phân trang). */
export const uuidV7Pk = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7());

/** Cột geography(Point,4326). Ghi { lat, lng } → EWKT; đọc EWKB hex → { lat, lng }. */
export type LatLng = { lat: number; lng: number };

export const geographyPoint = customType<{ data: LatLng; driverData: string }>({
  dataType: () => 'geography(Point,4326)',
  toDriver: (value) => latLngToEwkt(value),
  fromDriver: (value) => ewkbToLatLng(value),
});

/** { lat, lng } → EWKT. Trong SQL viết tay phải ép `${v}::geography`. */
export function latLngToEwkt(value: LatLng): string {
  return `SRID=4326;POINT(${value.lng} ${value.lat})`;
}

/** EWKB hex (postgres.js trả cho geography) → { lat, lng }. */
export function ewkbToLatLng(hex: string): LatLng {
  // EWKB: 1 byte endian · 4 byte type (cờ SRID 0x20000000) · [4 byte SRID] · 8 byte X · 8 byte Y
  const buf = Buffer.from(hex, 'hex');
  const littleEndian = buf[0] === 1;
  const type = littleEndian ? buf.readUInt32LE(1) : buf.readUInt32BE(1);
  const hasSrid = (type & 0x20000000) !== 0;
  const offset = 5 + (hasSrid ? 4 : 0);
  const x = littleEndian ? buf.readDoubleLE(offset) : buf.readDoubleBE(offset);
  const y = littleEndian ? buf.readDoubleLE(offset + 8) : buf.readDoubleBE(offset + 8);
  return { lng: x, lat: y };
}
