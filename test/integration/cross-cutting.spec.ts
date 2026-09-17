import { Body, Controller, Get, type INestApplication, Module, Param, Post, Query, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { I18n, type I18nContext } from 'nestjs-i18n';
import request from 'supertest';
import { z } from 'zod';
import { AppModule, GLOBAL_PREFIX_EXCLUDE } from '../../src/app.module.js';
import { Public } from '../../src/common/auth/decorators.js';
import { AppException } from '../../src/common/http/exceptions.js';

/** Controller CHỈ cho test: pipe zod, envelope, filter, i18n qua enhancer toàn cục. @Public() vì không test auth ở đây. */
const CreateProbeSchema = z.object({ name: z.string().trim().min(1).max(20), age: z.coerce.number().int().min(0) });

@Public()
@Controller('probe')
class ProbeController {
  @Post()
  create(@Body({ schema: CreateProbeSchema }) body: z.infer<typeof CreateProbeSchema>) {
    return body;
  }

  @Get('list')
  list(@Query({ schema: z.object({ limit: z.coerce.number().default(20) }) }) q: { limit: number }) {
    return [1, 2, 3].slice(0, q.limit);
  }

  @Get('boom')
  boom(): never {
    throw new Error('kaboom');
  }

  @Get('hello')
  hello(@I18n() i18n: I18nContext): { text: string } {
    return { text: i18n.t('common.hello') };
  }

  @Get(':id')
  byId(@Param('id', { schema: z.uuid() }) id: string) {
    if (id.startsWith('00000000')) throw new AppException('NOT_FOUND', { resource: 'probe', id });
    return { id };
  }
}

@Module({ controllers: [ProbeController] })
class ProbeModule {}

describe('Cross-cutting (e2e): validation · envelope · errors · i18n · prefix', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule, ProbeModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api', { exclude: GLOBAL_PREFIX_EXCLUDE });
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
  });
  afterAll(async () => app.close());

  it('prefix /api/v1 áp cho route thường, health nằm ngoài', async () => {
    await request(app.getHttpServer()).get('/health/live').expect(200);
    await request(app.getHttpServer()).get('/api/v1/probe/list').expect(200);
    await request(app.getHttpServer()).get('/probe/list').expect(404);
  });

  it('body hợp lệ → envelope { data, meta.requestId }, text trim, số bị coerce', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/probe')
      .send({ name: '  Minh ', age: '7' })
      .expect(201);
    expect(res.body.data).toEqual({ name: 'Minh', age: 7 });
    expect(res.body.meta.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers['x-request-id']).toBe(res.body.meta.requestId);
  });

  it('body sai → 422 VALIDATION_FAILED với issues[path,message]', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/probe').send({ age: -1 }).expect(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    const paths = res.body.error.issues ?? res.body.error.params.issues.map((i: { path: string }) => i.path);
    expect(paths).toEqual(expect.arrayContaining(['name', 'age']));
    expect(res.body.error.requestId).toBeTruthy();
  });

  it('query coerce + envelope: mảng trả về nằm trong data, meta chỉ có requestId', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/probe/list?limit=2').expect(200);
    expect(res.body.data).toEqual([1, 2]);
    expect(res.body.meta).toEqual({ requestId: expect.any(String) });
  });

  it('param không phải uuid → 422; AppException → 404 NOT_FOUND kèm params', async () => {
    await request(app.getHttpServer()).get('/api/v1/probe/not-a-uuid').expect(422);
    const res = await request(app.getHttpServer())
      .get('/api/v1/probe/00000000-0000-7000-8000-000000000000')
      .expect(404);
    expect(res.body.error).toEqual({
      code: 'NOT_FOUND',
      params: { resource: 'probe', id: '00000000-0000-7000-8000-000000000000' },
      requestId: expect.any(String),
    });
  });

  it('route không tồn tại → 404 NOT_FOUND; lỗi lạ → 500 INTERNAL không lộ message', async () => {
    const nf = await request(app.getHttpServer()).get('/api/v1/__nope').expect(404);
    expect(nf.body.error.code).toBe('NOT_FOUND');
    const boom = await request(app.getHttpServer()).get('/api/v1/probe/boom').expect(500);
    expect(boom.body.error.code).toBe('INTERNAL');
    expect(JSON.stringify(boom.body)).not.toContain('kaboom');
  });

  it('i18n: mặc định vi, Accept-Language: en → tiếng Anh', async () => {
    const vi = await request(app.getHttpServer()).get('/api/v1/probe/hello').expect(200);
    expect(vi.body.data.text).toBe('Xin chào');
    const en = await request(app.getHttpServer()).get('/api/v1/probe/hello').set('Accept-Language', 'en').expect(200);
    expect(en.body.data.text).toBe('Hello');
  });

  it('/health/ready giữ shape Terminus, không bị bọc envelope', async () => {
    const res = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data).toBeUndefined();
  });
});
