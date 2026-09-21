import { AppException } from '../../src/common/http/exceptions.js';
import { LOCATION_LIMITS } from '../../src/modules/location/location.constants.js';
import type { LocationRepository } from '../../src/modules/location/location.repository.js';
import { LocationService } from '../../src/modules/location/location.service.js';
import type { SavedLocationRow } from '../../src/modules/location/schema/location.schema.js';

/**
 * Unit test service: repository thay bằng object cùng interface (dependency double), KHÔNG mock logic đang test.
 * SQL thật được kiểm ở test/integration/location.spec.ts.
 */
const row = (n: number, userId = 'u1'): SavedLocationRow => ({
  id: `0199aaaa-0000-7000-8000-0000000000${String(n).padStart(2, '0')}`,
  userId,
  name: `Địa điểm ${n}`,
  point: { lat: 10.7 + n / 1000, lng: 106.7 },
  radiusMeters: 500,
  isPublic: false,
  createdAt: new Date(Date.UTC(2026, 8, 16, 10, 0, n)),
  updatedAt: new Date(Date.UTC(2026, 8, 16, 10, 0, n)),
});

function makeRepo(overrides: Partial<LocationRepository> = {}): LocationRepository {
  return {
    insert: async (userId, data) => ({ ...row(1, userId), ...data }),
    countByUser: async () => 0,
    findPage: async () => [],
    findById: async () => null,
    deleteById: async () => false,
    findPublicWithin: async () => [],
    ...overrides,
  } as LocationRepository;
}

describe('LocationService', () => {
  it('create: đủ 20 địa điểm → CONFLICT LIMIT_REACHED; chưa đủ → tạo và map lat/lng, ISO date', async () => {
    const full = new LocationService(makeRepo({ countByUser: async () => LOCATION_LIMITS.maxPerUser }));
    await expect(full.create('u1', { name: 'Nhà', lat: 10.7, lng: 106.7, radiusMeters: 500, isPublic: false })).rejects.toMatchObject({
      code: 'CONFLICT',
      params: { reason: 'LIMIT_REACHED', max: LOCATION_LIMITS.maxPerUser },
    });

    const ok = new LocationService(makeRepo());
    const created = await ok.create('u1', { name: 'Nhà', lat: 10.7, lng: 106.7, radiusMeters: 300, isPublic: true });
    expect(created).toEqual({
      id: expect.any(String),
      name: 'Nhà',
      lat: 10.7,
      lng: 106.7,
      radiusMeters: 300,
      isPublic: true,
      createdAt: '2026-09-16T10:00:01.000Z',
    });
  });

  it('list: xin limit+1 từ repo, trả limit dòng + nextCursor; cursor hỏng → BAD_REQUEST', async () => {
    let askedLimit = 0;
    const service = new LocationService(
      makeRepo({
        findPage: async (_u, limit) => {
          askedLimit = limit;
          return [row(3), row(2), row(1)];
        },
      }),
    );
    const page = await service.list('u1', { limit: 2 });
    expect(askedLimit).toBe(3);
    expect(page.data.map((r) => r.name)).toEqual(['Địa điểm 3', 'Địa điểm 2']);
    expect(page.meta.nextCursor).toEqual(expect.any(String));
    await expect(service.list('u1', { limit: 2, cursor: '!!!' })).rejects.toBeInstanceOf(AppException);
  });

  it('get/remove: không có (hoặc của người khác) → NOT_FOUND', async () => {
    const service = new LocationService(makeRepo());
    await expect(service.get('u1', row(1).id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service.remove('u1', row(1).id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('nearbyPublic: chỉ trường an toàn, làm tròn distanceMeters', async () => {
    const r = row(1);
    const service = new LocationService(
      makeRepo({ findPublicWithin: async () => [{ id: r.id, name: r.name, point: r.point, distanceMeters: 123.6 }] }),
    );
    const [hit] = await service.nearbyPublic({ lat: 10.7, lng: 106.7, radiusMeters: 1000 });
    expect(hit).toEqual({ id: r.id, name: 'Địa điểm 1', lat: r.point.lat, lng: r.point.lng, distanceMeters: 124 });
  });
});
