import type { INestApplication } from '@nestjs/common';
import { VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { type FakeSupabase, startFakeSupabase } from '../setup/jwks.js';

/** /public/configs: không token, enum từ code + nhãn i18n mọi ngôn ngữ, lọc theo names, tên lạ bỏ qua, Cache-Control. */
describe('Public configs (e2e)', () => {
  let app: INestApplication;
  let supabase: FakeSupabase;

  beforeAll(async () => {
    supabase = await startFakeSupabase();
    supabase.applyEnv();
    const { AppModule, GLOBAL_PREFIX_EXCLUDE } = await import('../../src/app.module.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: GLOBAL_PREFIX_EXCLUDE });
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await supabase.close();
  });

  it('system_enums: user.status và role.code với label vi/en, sort theo thứ tự code, color', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/public/configs?names=system_enums').expect(200);
    expect(res.headers['cache-control']).toBe('public, max-age=300');
    expect(res.body.data).toHaveLength(1);
    const { name, data } = res.body.data[0];
    expect(name).toBe('system_enums');
    expect(data.languages.sort()).toEqual(['en', 'vi']);
    expect(data.defaultLanguage).toBe('vi');
    expect(data.enums['user.status']).toEqual({
      active: { sort: 1, color: '#22c55e', label: { vi: 'Đang hoạt động', en: 'Active' } },
      blocked: { sort: 2, color: '#ef4444', label: { vi: 'Bị khoá', en: 'Blocked' } },
    });
    expect(Object.keys(data.enums['role.code'])).toEqual(['user', 'moderator', 'venue', 'admin']);
    expect(data.enums['role.code'].admin.label.vi).toBe('Quản trị');
  });

  it('không names → tất cả; tên lạ → bỏ qua; nhiều names lặp lại', async () => {
    const all = await request(app.getHttpServer()).get('/api/v1/public/configs').expect(200);
    expect(all.body.data.map((c: { name: string }) => c.name)).toEqual(['system_enums']);

    const unknown = await request(app.getHttpServer()).get('/api/v1/public/configs?names=nope').expect(200);
    expect(unknown.body.data).toEqual([]);

    const multi = await request(app.getHttpServer()).get('/api/v1/public/configs?names=nope&names=system_enums').expect(200);
    expect(multi.body.data.map((c: { name: string }) => c.name)).toEqual(['system_enums']);
  });
});
