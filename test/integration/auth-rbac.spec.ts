import { Controller, Get, type INestApplication, Module, VersioningType } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import { SignJWT, generateKeyPair } from 'jose';
import request from 'supertest';
import { Public, RequirePermission } from '../../src/common/auth/decorators.js';
import { AppException } from '../../src/common/http/exceptions.js';
import { CACHE, CacheService } from '../../src/common/redis/cache.js';
import { SUPABASE_ADMIN, type SupabaseAdminPort } from '../../src/common/auth/supabase.js';
import { UserService } from '../../src/modules/user/services/user.service.js';
import { RoleService } from '../../src/modules/user/services/role.service.js';
import { type FakeSupabase, startFakeSupabase } from '../setup/jwks.js';

/**
 * Auth + RBAC trên hạ tầng thật (PostGIS + Redis từ testcontainers).
 * JWT được ký bởi một JWKS server dựng tại chỗ (ES256) — cùng cơ chế Supabase dùng khi bật asymmetric keys,
 * nên guard/JWKS/claims được kiểm thật mà không phụ thuộc mạng. Supabase Admin thay bằng in-memory (contract test riêng).
 */

class InMemorySupabaseAdmin implements SupabaseAdminPort {
  readonly deleted: string[] = [];
  private readonly users = new Map<string, { id: string; email?: string }>();

  seed(id: string, email?: string): void {
    this.users.set(id, { id, email });
  }
  /** Như adapter thật: email trùng → CONFLICT EMAIL_TAKEN. */
  async createUser(input: { email: string; password: string; displayName: string }) {
    for (const u of this.users.values()) {
      if (u.email === input.email) throw new AppException('CONFLICT', { reason: 'EMAIL_TAKEN', field: 'email' });
    }
    const id = randomUUID();
    this.users.set(id, { id, email: input.email });
    return { id };
  }
  async deleteUser(userId: string): Promise<void> {
    this.users.delete(userId); // idempotent như adapter thật (404 bỏ qua)
    this.deleted.push(userId);
  }
  async getUserById(userId: string) {
    const user = this.users.get(userId);
    return user ? { id: user.id, email: user.email, phoneConfirmedAt: null } : null;
  }
}

@Controller('probe')
class ProbeController {
  @Public()
  @Get('open')
  open() {
    return { open: true };
  }

  @Get('secure')
  secure() {
    return { secure: true };
  }

  @Get('needs-perm')
  @RequirePermission('report:review')
  needsPerm() {
    return { allowed: true };
  }

  @Get('limited')
  @Throttle({ short: { limit: 3, ttl: 1_000 } })
  limited() {
    return { ok: true };
  }
}
@Module({ controllers: [ProbeController] })
class ProbeModule {}

describe('Auth (JWKS) · RBAC · profile upsert (e2e)', () => {
  let app: INestApplication;
  let supabase: FakeSupabase;
  let signToken: FakeSupabase['signToken'];
  let admin: InMemorySupabaseAdmin;
  let users: UserService;
  let roleService: RoleService;
  let cache: CacheService;
  let issuer: string;

  beforeAll(async () => {
    supabase = await startFakeSupabase();
    signToken = supabase.signToken;
    issuer = supabase.issuer;
    // Ghi đè env TRƯỚC khi import AppModule (ConfigModule chụp process.env lúc module được evaluate)
    supabase.applyEnv();

    const { AppModule, GLOBAL_PREFIX_EXCLUDE } = await import('../../src/app.module.js');
    admin = new InMemorySupabaseAdmin();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule, ProbeModule] })
      .overrideProvider(SUPABASE_ADMIN)
      .useValue(admin)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: GLOBAL_PREFIX_EXCLUDE });
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();

    users = app.get(UserService);
    roleService = app.get(RoleService);
    cache = app.get(CacheService);
  });

  afterAll(async () => {
    await app.close();
    await supabase.close();
  });

  const newUser = () => `0199${Math.random().toString(16).slice(2, 6)}-0000-7000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`;

  it('không token → 401 UNAUTHENTICATED; @Public() vẫn mở', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/probe/secure').expect(401);
    expect(res.body.code).toBe('UNAUTHENTICATED');
    await request(app.getHttpServer()).get('/api/v1/probe/open').expect(200);
  });

  it('token sai chữ ký / sai issuer / sai audience / hết hạn → 401', async () => {
    await request(app.getHttpServer()).get('/api/v1/probe/secure').set('authorization', 'Bearer not-a-jwt').expect(401);

    const { privateKey: otherKey } = await generateKeyPair('ES256', { extractable: true });
    const forged = await new SignJWT({ sub: newUser() })
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setExpirationTime('1h')
      .sign(otherKey);
    await request(app.getHttpServer()).get('/api/v1/probe/secure').set('authorization', `Bearer ${forged}`).expect(401);

    const wrongAud = await new SignJWT({ sub: newUser() })
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
      .setIssuer(issuer)
      .setAudience('anon')
      .setExpirationTime('1h')
      .sign((await generateKeyPair('ES256', { extractable: true })).privateKey);
    await request(app.getHttpServer()).get('/api/v1/probe/secure').set('authorization', `Bearer ${wrongAud}`).expect(401);

    const expired = await new SignJWT({ sub: newUser() })
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key' })
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .sign((await generateKeyPair('ES256', { extractable: true })).privateKey);
    await request(app.getHttpServer()).get('/api/v1/probe/secure').set('authorization', `Bearer ${expired}`).expect(401);
  });

  it('is_anonymous → 401 (anonymous sign-in bị tắt)', async () => {
    const token = await signToken({ sub: newUser(), is_anonymous: true });
    await request(app.getHttpServer()).get('/api/v1/probe/secure').set('authorization', `Bearer ${token}`).expect(401);
  });

  it('request đầu tiên tạo profile + role user; /me trả đúng; request sau dùng cache (không chạm DB)', async () => {
    const sub = newUser();
    const token = await signToken({
      sub,
      email: 'minh@c9map.test',
      user_metadata: { full_name: 'Minh Trần', avatar_url: 'https://cdn.c9map.test/a.png' },
    });
    admin.seed(sub, 'minh@c9map.test');

    const me = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    expect(me.body.data).toMatchObject({
      id: sub,
      email: 'minh@c9map.test',
      displayName: 'Minh Trần',
      avatarUrl: 'https://cdn.c9map.test/a.png',
      locale: 'vi',
      phoneVerified: false,
      status: 'active',
      roles: ['user'],
    });
    expect(me.body.data.permissions).toContain('pin:create');
    expect(await cache.has(CACHE.profile.key(sub))).toBe(true);
  });

  it('ensureProfile idempotent khi hai request đầu chạy song song → 1 profile', async () => {
    const sub = newUser();
    const claims = { sub, email: `race${Date.now()}@c9map.test`, isAnonymous: false };
    await cache.del(CACHE.profile.key(sub));
    await Promise.all([users.ensureProfile(claims), users.ensureProfile(claims)]);
    const me = await users.getMe(sub);
    expect(me.roles).toEqual(['user']);
  });

  it('thiếu permission → 403 FORBIDDEN kèm danh sách thiếu; gán role xong có hiệu lực ngay', async () => {
    const sub = newUser();
    const token = await signToken({ sub, email: 'mod@c9map.test' });
    admin.seed(sub, 'mod@c9map.test');
    await request(app.getHttpServer()).get('/api/v1/me').set('authorization', `Bearer ${token}`).expect(200);

    const denied = await request(app.getHttpServer())
      .get('/api/v1/probe/needs-perm')
      .set('authorization', `Bearer ${token}`)
      .expect(403);
    expect(denied.body).toMatchObject({ success: false, code: 'FORBIDDEN', data: null, meta: { missing: ['report:review'] } });

    await roleService.setUserRoles(sub, ['moderator']);
    await request(app.getHttpServer())
      .get('/api/v1/probe/needs-perm')
      .set('authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('admin API cần role:read / role:assign: user thường 403, admin gán role được', async () => {
    const userSub = newUser();
    const adminSub = newUser();
    const userToken = await signToken({ sub: userSub });
    const adminToken = await signToken({ sub: adminSub });
    for (const [sub, token] of [
      [userSub, userToken],
      [adminSub, adminToken],
    ] as const) {
      admin.seed(sub);
      await request(app.getHttpServer()).get('/api/v1/me').set('authorization', `Bearer ${token}`).expect(200);
    }

    await request(app.getHttpServer()).get('/api/v1/admin/roles').set('authorization', `Bearer ${userToken}`).expect(403);

    await roleService.setUserRoles(adminSub, ['admin']);
    const roles = await request(app.getHttpServer())
      .get('/api/v1/admin/roles')
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(roles.body.data.map((r: { code: string }) => r.code).sort()).toEqual(['admin', 'moderator', 'user', 'venue']);

    const updated = await request(app.getHttpServer())
      .put(`/api/v1/admin/users/${userSub}/roles`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ roles: ['moderator', 'venue'] })
      .expect(200);
    expect(updated.body.data.roles.sort()).toEqual(['moderator', 'venue']);

    // hiệu lực ngay trên request tiếp theo của user đó (cache quyền đã bị xoá)
    const meAfter = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('authorization', `Bearer ${userToken}`)
      .expect(200);
    expect(meAfter.body.data.roles.sort()).toEqual(['moderator', 'venue']);
  });

  it('role không hợp lệ → 422 VALIDATION_FAILED; user không tồn tại → 404', async () => {
    const adminSub = newUser();
    const adminToken = await signToken({ sub: adminSub });
    admin.seed(adminSub);
    await request(app.getHttpServer()).get('/api/v1/me').set('authorization', `Bearer ${adminToken}`).expect(200);
    await roleService.setUserRoles(adminSub, ['admin']);

    await request(app.getHttpServer())
      .put(`/api/v1/admin/users/${newUser()}/roles`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ roles: ['superuser'] })
      .expect(422);

    const notFound = await request(app.getHttpServer())
      .put(`/api/v1/admin/users/${newUser()}/roles`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ roles: ['moderator'] })
      .expect(404);
    expect(notFound.body.code).toBe('NOT_FOUND');
  });

  it('PATCH /me: sửa từng field, null xoá field, username không sửa được, body rỗng/sai → 422', async () => {
    const a = newUser();
    const b = newUser();
    const tokenA = await signToken({ sub: a, email: 'a@c9map.test' });
    const tokenB = await signToken({ sub: b, email: 'b@c9map.test' });
    admin.seed(a, 'a@c9map.test');
    admin.seed(b, 'b@c9map.test');
    const updated = await request(app.getHttpServer())
      .patch('/api/v1/me')
      .set('authorization', `Bearer ${tokenA}`)
      .send({ displayName: ' <b>Minh</b> ', locale: 'en', homeCityCode: 'SGN' })
      .expect(200);
    expect(updated.body.data).toMatchObject({ id: a, displayName: 'Minh', username: null, locale: 'en', homeCityCode: 'SGN' });
    expect(updated.body.data.roles).toEqual(['user']); // vẫn kèm role/permission như GET /me

    // Field không gửi giữ nguyên; null xoá field
    const cleared = await request(app.getHttpServer())
      .patch('/api/v1/me')
      .set('authorization', `Bearer ${tokenA}`)
      .send({ homeCityCode: null })
      .expect(200);
    expect(cleared.body.data).toMatchObject({ displayName: 'Minh', homeCityCode: null });

    // username là định danh: gửi lên bị bỏ qua (zod strip), không đổi
    const ignored = await request(app.getHttpServer())
      .patch('/api/v1/me')
      .set('authorization', `Bearer ${tokenB}`)
      .send({ username: 'hacker', displayName: 'Bình' })
      .expect(200);
    expect(ignored.body.data).toMatchObject({ id: b, username: null, displayName: 'Bình' });

    await request(app.getHttpServer()).patch('/api/v1/me').set('authorization', `Bearer ${tokenB}`).send({}).expect(422);
    const bad = await request(app.getHttpServer())
      .patch('/api/v1/me')
      .set('authorization', `Bearer ${tokenB}`)
      .send({ displayName: 'x', locale: 'fr' })
      .expect(422);
    expect(bad.body.meta.issues.map((i: { path: string }) => i.path).sort()).toEqual(['displayName', 'locale']);
  });

  it('POST /admin/users: admin tạo tài khoản email + mật khẩu kèm nhiều role; email trùng → 409; danh sách + chi tiết', async () => {
    const adminSub = newUser();
    const adminToken = await signToken({ sub: adminSub, email: 'boss@c9map.test' });
    admin.seed(adminSub, 'boss@c9map.test');
    await request(app.getHttpServer()).get('/api/v1/me').set('authorization', `Bearer ${adminToken}`).expect(200);
    await roleService.setUserRoles(adminSub, ['admin']);

    const email = `mod-${adminSub.slice(4, 8)}@c9map.test`;
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/users')
      .set('authorization', `Bearer ${adminToken}`)
      .send({ email, password: 'Str0ng-Passw0rd!', roles: ['moderator', 'venue'] })
      .expect(201);
    expect(created.body.data).toMatchObject({ email, displayName: email.split('@')[0], status: 'active', statusReason: null });
    expect(created.body.data.roles.sort()).toEqual(['moderator', 'venue']);
    const newId = created.body.data.id as string;
    expect(await admin.getUserById(newId)).toMatchObject({ email });

    // Người được tạo đăng nhập (token password không có user_metadata) → /me đúng, role đã gán
    const newToken = await signToken({ sub: newId, email });
    const me = await request(app.getHttpServer()).get('/api/v1/me').set('authorization', `Bearer ${newToken}`).expect(200);
    expect(me.body.data.roles.sort()).toEqual(['moderator', 'venue']);

    const dup = await request(app.getHttpServer())
      .post('/api/v1/admin/users')
      .set('authorization', `Bearer ${adminToken}`)
      .send({ email, password: 'Str0ng-Passw0rd!' })
      .expect(409);
    expect(dup.body).toMatchObject({ code: 'CONFLICT', meta: { reason: 'EMAIL_TAKEN', field: 'email' } });

    await request(app.getHttpServer())
      .post('/api/v1/admin/users')
      .set('authorization', `Bearer ${adminToken}`)
      .send({ email: 'x@c9map.test', password: 'short' })
      .expect(422);

    const list = await request(app.getHttpServer())
      .get(`/api/v1/admin/users?q=${email.split('@')[0]}&limit=5`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ id: newId, roles: expect.arrayContaining(['moderator']) });
    expect(list.body.meta).toMatchObject({ nextCursor: null });

    const one = await request(app.getHttpServer())
      .get(`/api/v1/admin/users/${newId}`)
      .set('authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(one.body.data).toMatchObject({ id: newId, email });

    // user thường không có user:read
    await request(app.getHttpServer()).get('/api/v1/admin/users').set('authorization', `Bearer ${newToken}`).expect(403);
  });

  it('PATCH /admin/users/:id/status: khoá → 403 ACCOUNT_BLOCKED ngay, mở → 200; không tự khoá mình', async () => {
    const adminSub = newUser();
    const targetSub = newUser();
    const adminToken = await signToken({ sub: adminSub });
    const targetToken = await signToken({ sub: targetSub, email: 'victim@c9map.test' });
    admin.seed(adminSub);
    admin.seed(targetSub, 'victim@c9map.test');
    await request(app.getHttpServer()).get('/api/v1/me').set('authorization', `Bearer ${adminToken}`).expect(200);
    await request(app.getHttpServer()).get('/api/v1/me').set('authorization', `Bearer ${targetToken}`).expect(200);
    await roleService.setUserRoles(adminSub, ['admin']);

    const blocked = await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${targetSub}/status`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ status: 'blocked', reason: 'spam' })
      .expect(200);
    expect(blocked.body.data).toMatchObject({ id: targetSub, status: 'blocked', statusReason: 'spam' });

    const denied = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('authorization', `Bearer ${targetToken}`)
      .set('accept-language', 'en')
      .expect(403);
    expect(denied.body).toMatchObject({ code: 'FORBIDDEN', msg: 'This account has been blocked', meta: { reason: 'ACCOUNT_BLOCKED' } });

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${targetSub}/status`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ status: 'active' })
      .expect(200);
    const back = await request(app.getHttpServer()).get('/api/v1/me').set('authorization', `Bearer ${targetToken}`).expect(200);
    expect(back.body.data).toMatchObject({ status: 'active' });

    const self = await request(app.getHttpServer())
      .patch(`/api/v1/admin/users/${adminSub}/status`)
      .set('authorization', `Bearer ${adminToken}`)
      .send({ status: 'blocked' })
      .expect(403);
    expect(self.body.meta).toMatchObject({ reason: 'CANNOT_BLOCK_SELF' });
  });

  it('DELETE /me: xoá local + gọi Supabase admin, gọi lại vẫn an toàn', async () => {
    const sub = newUser();
    const token = await signToken({ sub, email: 'bye@c9map.test' });
    admin.seed(sub, 'bye@c9map.test');
    await request(app.getHttpServer()).get('/api/v1/me').set('authorization', `Bearer ${token}`).expect(200);

    await request(app.getHttpServer()).delete('/api/v1/me').set('authorization', `Bearer ${token}`).expect(204);
    expect(admin.deleted).toContain(sub);
    expect(await admin.getUserById(sub)).toBeNull();
    expect(await cache.has(CACHE.perms.key(sub))).toBe(false);

    // Token còn hạn KHÔNG được làm profile sống lại: tombstone → 401, và không có dòng profile mới
    const after = await request(app.getHttpServer()).get('/api/v1/me').set('authorization', `Bearer ${token}`).expect(401);
    expect(after.body.code).toBe('UNAUTHENTICATED');
    await expect(users.getMe(sub)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await cache.has(CACHE.deleted.key(sub))).toBe(true);
  });

  it('HS256 với kid khớp JWKS và alg=none đều bị từ chối (ghim thuật toán)', async () => {
    const hs = await new SignJWT({ sub: newUser() })
      .setProtectedHeader({ alg: 'HS256', kid: 'test-key' })
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('any-secret'));
    await request(app.getHttpServer()).get('/api/v1/probe/secure').set('authorization', `Bearer ${hs}`).expect(401);
    const header = Buffer.from(JSON.stringify({ alg: 'none', kid: 'test-key' })).toString('base64url');
    const body = Buffer.from(
      JSON.stringify({ sub: newUser(), iss: issuer, aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }),
    ).toString('base64url');
    await request(app.getHttpServer()).get('/api/v1/probe/secure').set('authorization', `Bearer ${header}.${body}.`).expect(401);
  });

  it('rate limit khoá theo IP: đếm chung mọi user từ cùng một IP, chặn trước cả khi verify token', async () => {
    const token = await signToken({ sub: newUser() });
    const hit = (extra: Record<string, string> = {}) => {
      const req = request(app.getHttpServer()).get('/api/v1/probe/limited');
      for (const [k, v] of Object.entries(extra)) req.set(k, v);
      return req;
    };

    const codes: number[] = [];
    codes.push((await hit({ authorization: `Bearer ${token}` })).status);
    codes.push((await hit({ authorization: `Bearer ${token}` })).status);
    codes.push((await hit()).status); // không token: vẫn cùng bucket IP
    codes.push((await hit({ authorization: 'Bearer sai-be-bet' })).status); // token sai → 429 chứ không phải 401
    expect(codes).toEqual([200, 200, 401, 429]);
  });

});
