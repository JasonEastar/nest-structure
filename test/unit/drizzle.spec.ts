import { ewkbToLatLng, latLngToEwkt } from '../../src/common/database/drizzle.js';

describe('geography helpers', () => {
  it('latLngToEwkt: lng trước lat, SRID 4326', () => {
    expect(latLngToEwkt({ lat: 10.7798, lng: 106.699 })).toBe('SRID=4326;POINT(106.699 10.7798)');
  });

  it('ewkbToLatLng: little-endian có SRID (đúng định dạng PostGIS trả về)', () => {
    // POINT(106.699 10.7798) SRID=4326, little-endian, type 0x20000001
    const buf = Buffer.alloc(25);
    buf.writeUInt8(1, 0);
    buf.writeUInt32LE(0x20000001, 1);
    buf.writeUInt32LE(4326, 5);
    buf.writeDoubleLE(106.699, 9);
    buf.writeDoubleLE(10.7798, 17);
    expect(ewkbToLatLng(buf.toString('hex'))).toEqual({ lng: 106.699, lat: 10.7798 });
  });

  it('ewkbToLatLng: big-endian không SRID', () => {
    const buf = Buffer.alloc(21);
    buf.writeUInt8(0, 0);
    buf.writeUInt32BE(1, 1);
    buf.writeDoubleBE(106.699, 5);
    buf.writeDoubleBE(10.7798, 13);
    expect(ewkbToLatLng(buf.toString('hex'))).toEqual({ lng: 106.699, lat: 10.7798 });
  });
});
