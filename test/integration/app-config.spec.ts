import type { INestApplication } from '@nestjs/common';
import { VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { SUPABASE_ADMIN, type SupabaseAdminPort } from '../../src/common/auth/supabase.js';
import { RoleService } from '../../src/modules/user/services/role.service.js';
import { type FakeSupabase, startFakeSupabase } from '../setup/jwks.js';

/**
 * app-config trên DB thật: seed system_enums (migration 0008) đọc được công khai với nhãn vi/en; names không bắt buộc;
 * admin CRUD cần permission config:*; private không lộ qua /public; trùng tên → 409; xoá → 404.
 */
describe('App configs (e2e)', () => {
  let app: INestApplication;
  let supabase: FakeSupabase;
  let adminToken: string;
  let userToken: string;
  const api = () => request(app.getHttpServer());
  const admin: SupabaseAdminPort = { createUser: async () => ({ id: 'x' }), deleteUser: async () => {}, getUserById: async () => null };

  beforeAll(async () => {
    supabase = await startFakeSupabase();
    supabase.applyEnv();
    const { AppModule, GLOBAL_PREFIX_EXCLUDE } = await import('../../src/app.module.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(SUPABASE_ADMIN).useValue(admin).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: GLOBAL_PREFIX_EXCLUDE });
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();

    const adminSub = `0199cf00-0000-7000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`;
    const userSub = `0199cf01-0000-7000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`;
    adminToken = await supabase.signToken({ sub: adminSub });
    userToken = await supabase.signToken({ sub: userSub });
    await api().get('/api/v1/me').set('authorization', `Bearer ${adminToken}`).expect(200); // tạo profile
    await api().get('/api/v1/me').set('authorization', `Bearer ${userToken}`).expect(200);
    await app.get(RoleService).setUserRoles(adminSub, ['admin']);
  });

  afterAll(async () => {
    await app?.close();
    await supabase.close();
  });

  it('public: system_enums từ seed có nhãn vi/en, sort, color; Cache-Control; names không bắt buộc, tên lạ bỏ qua', async () => {
    const res = await api().get('/api/v1/public/configs?names=system_enums').expect(200);
    expect(res.headers['cache-control']).toBe('public, max-age=300');
    expect(res.body.data).toHaveLength(1);
    const { name, data, isPublic } = res.body.data[0];
    expect(name).toBe('system_enums');
    expect(isPublic).toBe(true);
    expect(data.languages).toEqual(['vi', 'en']);
    expect(data.enums['user.status'].blocked).toEqual({ sort: 2, color: '#ef4444', label: { vi: 'Bị khoá', en: 'Blocked' } });
    expect(Object.keys(data.enums['role.code'])).toHaveLength(4);

    const all = await api().get('/api/v1/public/configs').expect(200);
    expect(all.body.data.map((c: { name: string }) => c.name)).toContain('system_enums');
    const unknown = await api().get('/api/v1/public/configs?names=nope').expect(200);
    expect(unknown.body.data).toEqual([]);
  });

  it('admin CRUD: user thường 403; tạo (private không lộ public) → sửa thành public → xoá → 404; trùng tên → 409', async () => {
    const name = `support_bank_${Date.now().toString(36)}`;
    const body = { name, data: { banks: [{ code: 'VCB', label: { vi: 'Vietcombank', en: 'Vietcombank' } }] }, isPublic: false };

    await api().post('/api/v1/admin/configs').set('authorization', `Bearer ${userToken}`).send(body).expect(403);

    const created = await api().post('/api/v1/admin/configs').set('authorization', `Bearer ${adminToken}`).send(body).expect(201);
    expect(created.body.data).toMatchObject({ name, isPublic: false, data: body.data });
    const id = created.body.data.id as string;

    // private: admin thấy, public không
    const adminList = await api().get(`/api/v1/admin/configs?names=${name}`).set('authorization', `Bearer ${adminToken}`).expect(200);
    expect(adminList.body.data).toHaveLength(1);
    const publicList = await api().get(`/api/v1/public/configs?names=${name}`).expect(200);
    expect(publicList.body.data).toEqual([]);

    const dup = await api().post('/api/v1/admin/configs').set('authorization', `Bearer ${adminToken}`).send(body).expect(409);
    expect(dup.body).toMatchObject({ code: 'CONFLICT', meta: { reason: 'NAME_TAKEN', field: 'name' } });

    await api().post('/api/v1/admin/configs').set('authorization', `Bearer ${adminToken}`).send({ name: 'Có Dấu', data: {} }).expect(422);

    const updated = await api()
      .put(`/api/v1/admin/configs/${id}`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ ...body, isPublic: true, data: { banks: [] } })
      .expect(200);
    expect(updated.body.data).toMatchObject({ id, isPublic: true, data: { banks: [] } });
    const nowPublic = await api().get(`/api/v1/public/configs?names=${name}`).expect(200);
    expect(nowPublic.body.data[0]).toMatchObject({ name, data: { banks: [] } });

    await api().delete(`/api/v1/admin/configs/${id}`).set('authorization', `Bearer ${adminToken}`).expect(204);
    const gone = await api().delete(`/api/v1/admin/configs/${id}`).set('authorization', `Bearer ${adminToken}`).expect(404);
    expect(gone.body.code).toBe('NOT_FOUND');
    await api().put(`/api/v1/admin/configs/${id}`).set('authorization', `Bearer ${adminToken}`).send(body).expect(404);
  });
});
