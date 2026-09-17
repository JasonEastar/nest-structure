import { createServer, type Server } from 'node:http';
import { Controller, Get, type INestApplication, Module, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { type JWTPayload, SignJWT, exportJWK, generateKeyPair } from 'jose';
import request from 'supertest';
import { Public, RequirePermissions } from '../src/common/decorators.js';
import { CacheService, cacheKeys } from '../src/common/redis.js';
import { SUPABASE_ADMIN, type SupabaseAdminPort } from '../src/common/supabase.js';
import { IdentityService } from '../src/modules/identity/identity.service.js';

/**
 * Auth + RBAC trên hạ tầng thật (Postgres + Redis từ `npm run dev:infra`).
 * JWT được ký bởi một JWKS server dựng tại chỗ (ES256) — cùng cơ chế Supabase dùng khi bật asymmetric keys,
 * nên guard/JWKS/claims được kiểm thật mà không phụ thuộc mạng. Supabase Admin thay bằng in-memory (contract test riêng).
 */

class InMemorySupabaseAdmin implements SupabaseAdminPort {
  readonly deleted: string[] = [];
  private readonly users = new Map<string, { id: string; email?: string }>();

  seed(id: string, email?: string): void {
    this.users.set(id, { id, email });
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
  @RequirePermissions(['report:review'])
  needsPerm() {
    return { allowed: true };
  }
}
@Module({ controllers: [ProbeController] })
class ProbeModule {}

describe('Auth (JWKS) · RBAC · profile upsert (e2e)', () => {
  let app: INestApplication;
  let jwksServer: Server;
  let signToken: (payload: JWTPayload & { sub: string }, overrides?: { kid?: string }) => Promise<string>;
  let admin: InMemorySupabaseAdmin;
  let identity: IdentityService;
  let cache: CacheService;
  let issuer: string;

  beforeAll(async () => {
    const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
    const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'ES256', use: 'sig' };

    jwksServer = createServer((req, res) => {
      if (req.url?.startsWith('/auth/v1/.well-known/jwks.json')) {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ keys: [jwk] }));
        return;
      }
      res.statusCode = 404;
      res.end();
    });
    await new Promise<void>((resolve) => jwksServer.listen(0, '127.0.0.1', resolve));
    const port = (jwksServer.address() as { port: number }).port;
    const baseUrl = `http://127.0.0.1:${port}`;
    issuer = `${baseUrl}/auth/v1`;

    signToken = (payload, overrides) =>
      new SignJWT(payload)
        .setProtectedHeader({ alg: 'ES256', kid: overrides?.kid ?? 'test-key' })
        .setIssuer(issuer)
        .setAudience('authenticated')
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(privateKey);

    // Ghi đè env TRƯỚC khi import AppModule (ConfigModule chụp process.env lúc module được evaluate)
    process.env.SUPABASE_URL = baseUrl;
    process.env.SUPABASE_JWKS_URL = `${issuer}/.well-known/jwks.json`;
    process.env.NODE_ENV = 'development'; // để Bull Board được mount (tắt khi NODE_ENV=test)
    const { AppModule, GLOBAL_PREFIX_EXCLUDE } = await import('../src/app.module.js');
    admin = new InMemorySupabaseAdmin();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule, ProbeModule] })
      .overrideProvider(SUPABASE_ADMIN)
      .useValue(admin)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: GLOBAL_PREFIX_EXCLUDE });
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();

    identity = app.get(IdentityService);
    cache = app.get(CacheService);
  });

  afterAll(async () => {
    await app.close();
    await new Promise<void>((resolve) => jwksServer.close(() => resolve()));
  });

  const newUser = () => `0199${Math.random().toString(16).slice(2, 6)}-0000-7000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`;

  it('không token → 401 UNAUTHENTICATED; @Public() vẫn mở', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/probe/secure').expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
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
      roles: ['user'],
    });
    expect(me.body.data.permissions).toContain('pin:create');
    expect(await cache.has(cacheKeys.profileExists(sub))).toBe(true);
  });

  it('ensureProfile idempotent khi hai request đầu chạy song song → 1 profile', async () => {
    const sub = newUser();
    const claims = { sub, email: `race${Date.now()}@c9map.test`, isAnonymous: false };
    await cache.del(cacheKeys.profileExists(sub));
    await Promise.all([identity.ensureProfile(claims), identity.ensureProfile(claims)]);
    const me = await identity.getMe(sub);
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
    expect(denied.body.error).toMatchObject({ code: 'FORBIDDEN', params: { missing: ['report:review'] } });

    await identity.setUserRoles(sub, ['moderator']);
    await request(app.getHttpServer())
      .get('/api/v1/probe/needs-perm')
      .set('authorization', `Bearer ${token}`)
      .expect(200);
  });

  it('admin API cần role:manage: user thường 403, admin gán role được', async () => {
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

    await identity.setUserRoles(adminSub, ['admin']);
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
    await identity.setUserRoles(adminSub, ['admin']);

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
    expect(notFound.body.error.code).toBe('NOT_FOUND');
  });

  it('x-device-id → ghi devices (1 lần/5 phút)', async () => {
    const sub = newUser();
    const token = await signToken({ sub });
    admin.seed(sub);
    const deviceId = `dev-${Date.now()}`;
    await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('authorization', `Bearer ${token}`)
      .set('x-device-id', deviceId)
      .expect(200);
    await new Promise((r) => setTimeout(r, 300)); // fire-and-forget
    expect(await cache.has(`c9:v1:device-seen:${sub}:${deviceId}`)).toBe(true);
  });

  it('DELETE /me: xoá local + gọi Supabase admin, gọi lại vẫn an toàn', async () => {
    const sub = newUser();
    const token = await signToken({ sub, email: 'bye@c9map.test' });
    admin.seed(sub, 'bye@c9map.test');
    await request(app.getHttpServer()).get('/api/v1/me').set('authorization', `Bearer ${token}`).expect(200);

    await request(app.getHttpServer()).delete('/api/v1/me').set('authorization', `Bearer ${token}`).expect(204);
    expect(admin.deleted).toContain(sub);
    expect(await admin.getUserById(sub)).toBeNull();
    expect(await cache.has(cacheKeys.perms(sub))).toBe(false);

    // Token còn hạn KHÔNG được làm profile sống lại: tombstone → 401, và không có dòng profile mới
    const after = await request(app.getHttpServer()).get('/api/v1/me').set('authorization', `Bearer ${token}`).expect(401);
    expect(after.body.error.code).toBe('UNAUTHENTICATED');
    await expect(identity.getMe(sub)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await cache.has(cacheKeys.deleted(sub))).toBe(true);
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

  it('Bull Board /admin/queues: không token 401, user thường 403, có queue:read → 200', async () => {
    await request(app.getHttpServer()).get('/admin/queues/api/queues').expect(401);

    const sub = newUser();
    const token = await signToken({ sub });
    admin.seed(sub);
    await request(app.getHttpServer()).get('/api/v1/me').set('authorization', `Bearer ${token}`).expect(200);
    const denied = await request(app.getHttpServer())
      .get('/admin/queues/api/queues')
      .set('authorization', `Bearer ${token}`)
      .expect(403);
    expect(denied.body.error.code).toBe('FORBIDDEN');

    await identity.setUserRoles(sub, ['admin']); // admin có queue:read
    const ok = await request(app.getHttpServer())
      .get('/admin/queues/api/queues')
      .set('authorization', `Bearer ${token}`)
      .expect(200);
    expect(ok.body.queues.map((q: { name: string }) => q.name)).toContain('marker-maintenance');
  });
});
