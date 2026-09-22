import type { INestApplication } from '@nestjs/common';
import { VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createClient } from '@supabase/supabase-js';
import request from 'supertest';
import { SUPABASE_ADMIN, type SupabaseAdminPort } from '../../src/common/auth/supabase.js';

/**
 * Chạy với Supabase project THẬT (Google/JWT signing keys đã bật). Tự skip khi thiếu khoá (PR từ fork, máy không có .env).
 * - Contract test SUPABASE_ADMIN chạy trên adapter thật (bản mock chạy trong auth-rbac).
 * - Token thật lấy như scripts/dev-token.mjs: createUser → generateLink(magiclink) → verifyOtp.
 */
const url = process.env.SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
const enabled = Boolean(url && secret && publishable && !url.includes('<project-ref>') && !url.startsWith('http://127.0.0.1'));

describe.skipIf(!enabled)('Supabase thật: JWKS + Admin API', () => {
  let app: INestApplication;
  let adminPort: SupabaseAdminPort;
  const admin = createClient(url ?? '', secret ?? '', { auth: { persistSession: false, autoRefreshToken: false } });
  const anon = createClient(url ?? '', publishable ?? '', { auth: { persistSession: false, autoRefreshToken: false } });
  const created: string[] = [];

  async function realToken(email: string): Promise<{ userId: string; token: string }> {
    const c = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: 'CI Tester' } });
    if (c.error && c.error.status !== 422) throw c.error;
    const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
    if (link.error) throw link.error;
    const v = await anon.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: 'magiclink' });
    if (v.error || !v.data.session || !v.data.user) throw v.error ?? new Error('no session');
    created.push(v.data.user.id);
    return { userId: v.data.user.id, token: v.data.session.access_token };
  }

  beforeAll(async () => {
    const { AppModule, GLOBAL_PREFIX_EXCLUDE } = await import('../../src/app.module.js');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: GLOBAL_PREFIX_EXCLUDE });
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
    adminPort = app.get<SupabaseAdminPort>(SUPABASE_ADMIN);
  });

  afterAll(async () => {
    await Promise.all(created.map((id) => admin.auth.admin.deleteUser(id).catch(() => undefined)));
    await app?.close();
  });

  it('JWKS của project có khoá bất đối xứng (đã bật + rotate JWT signing keys)', async () => {
    const jwks = (await (await fetch(`${url}/auth/v1/.well-known/jwks.json`)).json()) as { keys: { kty: string }[] };
    expect(jwks.keys.length).toBeGreaterThan(0);
    expect(jwks.keys.every((k) => k.kty !== 'oct')).toBe(true);
  });

  it('token thật → /me 200, profile tạo, roles [user]; DELETE /me 204 → user biến mất khỏi Supabase', async () => {
    const { userId, token } = await realToken(`ci+${Date.now()}@c9map.test`);
    const header = JSON.parse(Buffer.from(token.split('.')[0]!, 'base64url').toString()) as { alg: string };
    expect(['ES256', 'RS256']).toContain(header.alg);

    const me = await request(app.getHttpServer()).get('/api/v1/me').set('authorization', `Bearer ${token}`).expect(200);
    expect(me.body.data).toMatchObject({ id: userId, displayName: 'CI Tester', roles: ['user'] });

    await request(app.getHttpServer()).delete('/api/v1/me').set('authorization', `Bearer ${token}`).expect(204);
    expect(await adminPort.getUserById(userId)).toBeNull();
    await request(app.getHttpServer()).get('/api/v1/me').set('authorization', `Bearer ${token}`).expect(401);
  });

  it('contract createUser (adapter thật): tạo email + mật khẩu → đăng nhập được bằng signInWithPassword; email trùng → CONFLICT EMAIL_TAKEN', async () => {
    const email = `ci-pass+${Date.now()}@c9map.test`;
    const password = `Ci-${Date.now()}-Passw0rd!`;
    const { id } = await adminPort.createUser({ email, password, displayName: 'CI Staff' });
    created.push(id);

    const login = await anon.auth.signInWithPassword({ email, password });
    expect(login.error).toBeNull();
    expect(login.data.user?.id).toBe(id);
    expect(login.data.user?.app_metadata).toMatchObject({ must_change_password: true });

    await expect(adminPort.createUser({ email, password, displayName: 'Dup' })).rejects.toMatchObject({
      code: 'CONFLICT',
      params: { field: 'email' },
    });
  });

  it('contract SUPABASE_ADMIN (adapter thật): getUserById null khi không có; deleteUser idempotent', async () => {
    const ghost = '00000000-0000-4000-8000-000000000000';
    expect(await adminPort.getUserById(ghost)).toBeNull();
    await expect(adminPort.deleteUser(ghost)).resolves.toBeUndefined();
    await expect(adminPort.deleteUser(ghost)).resolves.toBeUndefined();
  });
});
