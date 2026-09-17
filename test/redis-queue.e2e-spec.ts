import { getQueueToken } from '@nestjs/bullmq';
import { Controller, Get, type INestApplication, Module, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Queue } from 'bullmq';
import { QueueEvents } from 'bullmq';
import request from 'supertest';
import { AppModule, GLOBAL_PREFIX_EXCLUDE } from '../src/app.module.js';
import { Public } from '../src/common/decorators.js';
import { QUEUES } from '../src/common/queue.js';
import { CacheService, redisOptions } from '../src/common/redis.js';
import { ConfigService } from '@nestjs/config';
import { MARKER_EXPIRE_JOB } from '../src/modules/pin/pin.constants.js';

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
 * Cần Postgres + Redis từ `npm run dev:infra`. Hai app trong cùng process = hai instance dùng chung Redis.
 */
describe('Redis · throttler · BullMQ (e2e, 2 instance)', () => {
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
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(res.body.error.params.limit).toBe(10);
  });

  it('health/docs không bị rate limit', async () => {
    for (let i = 0; i < 15; i++) await request(a.getHttpServer()).get('/health/live').expect(200);
  });

  it('scheduler: 2 instance cùng upsert → đúng 1 job scheduler', async () => {
    const queue = a.get<Queue>(getQueueToken(QUEUES.MARKER_MAINTENANCE));
    const schedulers = await queue.getJobSchedulers();
    const ours = schedulers.filter((s) => s.key === MARKER_EXPIRE_JOB.schedulerId); // BullMQ 6: id nằm ở `key`
    expect(ours).toHaveLength(1);
    expect(ours[0]?.pattern).toBe(MARKER_EXPIRE_JOB.pattern);
    expect(ours[0]?.tz).toBe(MARKER_EXPIRE_JOB.tz);
  });

  it('processor: job "expire" được một worker nhận và hoàn thành', async () => {
    const queue = a.get<Queue>(getQueueToken(QUEUES.MARKER_MAINTENANCE));
    const config = a.get(ConfigService);
    const events = new QueueEvents(queue.name, { connection: redisOptions(config, 1, true) as never, prefix: 'c9' });
    await events.waitUntilReady();
    try {
      const job = await queue.add(MARKER_EXPIRE_JOB.jobName, { manual: true });
      await job.waitUntilFinished(events, 10_000);
      expect(await job.getState()).toBe('completed');
    } finally {
      await events.close();
    }
  });
});
