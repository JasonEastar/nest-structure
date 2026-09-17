import type { INestApplication } from '@nestjs/common';
import { VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { LOCATION_LIMITS } from '../../src/modules/location/location.constants.js';
import { type FakeSupabase, startFakeSupabase } from '../setup/jwks.js';

/**
 * Module mẫu location trên hạ tầng thật (PostGIS + Redis testcontainers, JWT ký bởi JWKS giả).
 * Kiểm: validate 422 · tạo + đọc lại lat/lng · cursor phân trang · public nearby (không token, chỉ is_public, biên 299 m / 301 m)
 * · cách ly giữa 2 user · giới hạn 20 / user · xoá.
 */
describe('Locations (e2e)', () => {
  let app: INestApplication;
  let supabase: FakeSupabase;
  let tokenA: string;
  let tokenB: string;
  const api = () => request(app.getHttpServer());
  const sub = (n: number) => `1b000000-0000-4000-8000-00000000000${n}`;

  // Nhà thờ Đức Bà; điểm lệch m mét về phía bắc. 1° vĩ độ tại 10.78°N ≈ 110 613 m (công thức cung kinh tuyến WGS84).
  const center = { lat: 10.7798, lng: 106.699 };
  const meters = (m: number) => ({ lat: center.lat + m / 110_613, lng: center.lng });
  const throttleBefore = process.env.THROTTLE_SHORT_LIMIT;

  beforeAll(async () => {
    supabase = await startFakeSupabase();
    supabase.applyEnv();
    process.env.THROTTLE_SHORT_LIMIT = '1000'; // test tạo hàng chục request/giây; rate limit đã kiểm ở redis-queue.spec
    const { AppModule, GLOBAL_PREFIX_EXCLUDE } = await import('../../src/app.module.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: GLOBAL_PREFIX_EXCLUDE });
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
    tokenA = await supabase.signToken({ sub: sub(1), email: 'a@c9map.test' });
    tokenB = await supabase.signToken({ sub: sub(2), email: 'b@c9map.test' });
  });

  afterAll(async () => {
    await app?.close();
    await supabase.close();
    if (throttleBefore === undefined) delete process.env.THROTTLE_SHORT_LIMIT;
    else process.env.THROTTLE_SHORT_LIMIT = throttleBefore;
  });

  const create = (token: string, body: Record<string, unknown>) =>
    api().post('/api/v1/locations').set('authorization', `Bearer ${token}`).send(body);

  it('không token → 401; body sai (lat 91, name rỗng, radius quá nhỏ) → 422 kèm path', async () => {
    await api().post('/api/v1/locations').send({}).expect(401);
    const res = await create(tokenA, { name: '  ', lat: 91, lng: 106.7, radiusMeters: 10 }).expect(422);
    const paths = res.body.error.params.issues.map((i: { path: string }) => i.path);
    expect(paths).toEqual(expect.arrayContaining(['name', 'lat', 'radiusMeters']));
  });

  it('tạo → 201 envelope, đọc lại đúng lat/lng (đi qua geography), name bị strip HTML, radius mặc định 500', async () => {
    const res = await create(tokenA, { name: '<b>Nhà</b>', lat: center.lat, lng: center.lng }).expect(201);
    expect(res.body.data).toMatchObject({ name: 'Nhà', lat: center.lat, lng: center.lng, radiusMeters: 500, isPublic: false });
    expect(res.body.meta.requestId).toEqual(expect.any(String));

    const got = await api().get(`/api/v1/locations/${res.body.data.id}`).set('authorization', `Bearer ${tokenA}`).expect(200);
    expect(got.body.data).toEqual(res.body.data);
  });

  it('cách ly user: B không thấy/không xoá được địa điểm của A (NOT_FOUND, không lộ tồn tại)', async () => {
    const mine = await create(tokenA, { name: 'Công ty', lat: 10.8, lng: 106.7 }).expect(201);
    await api().get(`/api/v1/locations/${mine.body.data.id}`).set('authorization', `Bearer ${tokenB}`).expect(404);
    await api().delete(`/api/v1/locations/${mine.body.data.id}`).set('authorization', `Bearer ${tokenB}`).expect(404);
    const listB = await api().get('/api/v1/locations').set('authorization', `Bearer ${tokenB}`).expect(200);
    expect(listB.body.data).toEqual([]);
  });

  it('public nearby: không cần token; chỉ địa điểm is_public; 299 m vào, 301 m ra; không lộ chủ/bán kính', async () => {
    await create(tokenB, { name: 'gần', ...meters(299), isPublic: true }).expect(201);
    await create(tokenB, { name: 'xa', ...meters(301), isPublic: true }).expect(201);
    await create(tokenA, { name: 'riêng tư', ...meters(10) }).expect(201); // isPublic mặc định false → không bao giờ hiện
    const url = (r: number) => `/api/v1/public/locations/nearby?lat=${center.lat}&lng=${center.lng}&radiusMeters=${r}`;

    const res = await api().get(url(300)).expect(200); // không Authorization
    expect(res.body.data.map((r: { name: string }) => r.name)).toEqual(['gần']);
    expect(res.body.data[0].distanceMeters).toBeGreaterThanOrEqual(298);
    expect(res.body.data[0].distanceMeters).toBeLessThanOrEqual(300);
    expect(Object.keys(res.body.data[0]).sort()).toEqual(['distanceMeters', 'id', 'lat', 'lng', 'name']);

    const wide = await api().get(url(400)).expect(200);
    expect(wide.body.data.map((r: { name: string }) => r.name)).toEqual(['gần', 'xa']);
    await api().get(url(0)).expect(422); // validate vẫn chạy trên route public
    await api().get('/api/v1/locations').expect(401); // route thường vẫn cần token
  });

  it('list: mới nhất trước, cursor đi hết không trùng không sót; cursor hỏng → 400', async () => {
    const tokenC = await supabase.signToken({ sub: sub(3) });
    for (let i = 1; i <= 5; i++) await create(tokenC, { name: `L${i}`, lat: 10.7, lng: 106.7 }).expect(201);

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const url: string = `/api/v1/locations?limit=2${cursor ? `&cursor=${cursor}` : ''}`;
      const page = await api().get(url).set('authorization', `Bearer ${tokenC}`).expect(200);
      seen.push(...page.body.data.map((r: { name: string }) => r.name));
      cursor = page.body.meta.nextCursor;
    } while (cursor);
    expect(seen).toEqual(['L5', 'L4', 'L3', 'L2', 'L1']);

    const bad = await api().get('/api/v1/locations?cursor=!!!').set('authorization', `Bearer ${tokenC}`).expect(400);
    expect(bad.body.error).toMatchObject({ code: 'BAD_REQUEST', params: { field: 'cursor' } });
  });

  it('giới hạn 20 / user → 409 CONFLICT LIMIT_REACHED; xoá → 204 rồi 404', async () => {
    const tokenD = await supabase.signToken({ sub: sub(4) });
    const ids: string[] = [];
    for (let i = 0; i < LOCATION_LIMITS.maxPerUser; i++) {
      const r = await create(tokenD, { name: `P${i}`, lat: 10.7, lng: 106.7 }).expect(201);
      ids.push(r.body.data.id);
    }
    const over = await create(tokenD, { name: 'thừa', lat: 10.7, lng: 106.7 }).expect(409);
    expect(over.body.error).toMatchObject({ code: 'CONFLICT', params: { reason: 'LIMIT_REACHED', max: 20 } });

    await api().delete(`/api/v1/locations/${ids[0]}`).set('authorization', `Bearer ${tokenD}`).expect(204);
    await api().get(`/api/v1/locations/${ids[0]}`).set('authorization', `Bearer ${tokenD}`).expect(404);
    await create(tokenD, { name: 'lại được', lat: 10.7, lng: 106.7 }).expect(201);
  });
});
