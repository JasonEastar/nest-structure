import { Controller, Get, type INestApplication, Module, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule, GLOBAL_PREFIX_EXCLUDE } from '../../src/app.module.js';
import { Public } from '../../src/common/auth/decorators.js';
import { CacheService } from '../../src/common/redis/cache.js';

/** Route CHỈ cho test cross-cutting/rate-limit — @Public() để không cần token (auth test riêng ở auth-rbac). */
@Public()
@Controller('probe')
class ProbeController {
  @Get()
  ok() {
    return { ok: true };
  }
}
@Module({ controllers: [ProbeController] })
class ProbeModule {}

async function boot(instanceId: string): Promise<INestApplication> {
  process.env.INSTANCE_ID = instanceId;
  const moduleRef = await Test.createTestingModule({ imports: [AppModule, ProbeModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api', { exclude: GLOBAL_PREFIX_EXCLUDE });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  await app.init();
  return app;
}

/**
 * PostGIS + Redis từ testcontainers. Hai app trong cùng process = hai instance dùng chung Redis.
 */
describe('Redis · throttler (e2e, 2 instance)', () => {
  let a: INestApplication;
  let b: INestApplication;

  beforeAll(async () => {
    a = await boot('test-a');
    b = await boot('test-b');
  });
  afterAll(async () => {
    await Promise.all([a.close(), b.close()]);
  });

  it('CacheService: set ở instance A, đọc được ở instance B (state ngoài RAM)', async () => {
    const key = `c9:test:shared:${Date.now()}`;
    await a.get(CacheService).setJson(key, { from: 'a' }, 30);
    expect(await b.get(CacheService).getJson<{ from: string }>(key)).toEqual({ from: 'a' });
    await b.get(CacheService).del(key);
    expect(await a.get(CacheService).has(key)).toBe(false);
  });

  it('rate limit đếm CHUNG qua 2 instance: 6 request A + 6 request B → 429 + Retry-After + RATE_LIMITED', async () => {
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) codes.push((await request(a.getHttpServer()).get('/api/v1/probe')).status);
    for (let i = 0; i < 6; i++) codes.push((await request(b.getHttpServer()).get('/api/v1/probe')).status);
    expect(codes.slice(0, 10)).toEqual(Array(10).fill(200));
    expect(codes.slice(10)).toEqual([429, 429]);

    const res = await request(b.getHttpServer()).get('/api/v1/probe').expect(429);
    expect(res.headers['retry-after']).toMatch(/^\d+$/);
    expect(res.body.code).toBe('RATE_LIMITED');
    expect(res.body.meta.limit).toBe(10);
  });

  it('health/docs không bị rate limit', async () => {
    for (let i = 0; i < 15; i++) await request(a.getHttpServer()).get('/health/live').expect(200);
  });
});
