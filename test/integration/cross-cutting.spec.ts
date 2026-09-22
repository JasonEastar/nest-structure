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
    return { text: i18n.t('errors.UNAUTHENTICATED') };
  }

  @Get(':id')
  byId(@Param('id', { schema: z.uuid() }) id: string) {
    if (id.startsWith('00000000')) throw new AppException('NOT_FOUND', { id });
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

  it('body sai → 422 VALIDATION_FAILED với issues[path,message]; message dịch theo Accept-Language (zod locale), không lộ issue gốc', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/probe').send({ age: -1 }).expect(422);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    const paths = res.body.meta.issues.map((i: { path: string }) => i.path);
    expect(paths).toEqual(expect.arrayContaining(['name', 'age']));
    expect(res.body.meta.requestId).toBeTruthy();
    const age = res.body.meta.issues.find((i: { path: string }) => i.path === 'age');
    expect(Object.keys(age)).toEqual(['path', 'message']);
    expect(age.message).toMatch(/^Quá nhỏ/); // mặc định vi

    const en = await request(app.getHttpServer()).post('/api/v1/probe').send({ age: -1 }).set('Accept-Language', 'en').expect(422);
    expect(en.body.meta.issues.find((i: { path: string }) => i.path === 'age').message).toMatch(/^Too small/);
  });

  it('query coerce + envelope: mảng trả về nằm trong data, meta chỉ có requestId', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/probe/list?limit=2').expect(200);
    expect(res.body.data).toEqual([1, 2]);
    expect(res.body.meta).toEqual({ requestId: expect.any(String) });
  });

  it('param không phải uuid → 422; AppException → 404 với mã cụ thể kèm params', async () => {
    await request(app.getHttpServer()).get('/api/v1/probe/not-a-uuid').expect(422);
    const res = await request(app.getHttpServer())
      .get('/api/v1/probe/00000000-0000-7000-8000-000000000000')
      .expect(404);
    expect(res.body).toEqual({
      success: false,
      code: 'NOT_FOUND',
      msg: 'Không tìm thấy dữ liệu',
      data: null,
      meta: { id: '00000000-0000-7000-8000-000000000000', requestId: expect.any(String) },
    });
  });

  it('route không tồn tại → 404 NOT_FOUND; lỗi lạ → 500 INTERNAL không lộ message', async () => {
    const nf = await request(app.getHttpServer()).get('/api/v1/__nope').expect(404);
    expect(nf.body.code).toBe('NOT_FOUND');
    const boom = await request(app.getHttpServer()).get('/api/v1/probe/boom').expect(500);
    expect(boom.body.code).toBe('INTERNAL');
    expect(JSON.stringify(boom.body)).not.toContain('kaboom');
  });

  it('i18n: chỉ Accept-Language quyết định (vi mặc định, en, en-US → en, ?lang bị bỏ qua)', async () => {
    const vi = await request(app.getHttpServer()).get('/api/v1/probe/hello').expect(200);
    expect(vi.body.data.text).toBe('Bạn cần đăng nhập để tiếp tục');
    const en = await request(app.getHttpServer()).get('/api/v1/probe/hello').set('Accept-Language', 'en').expect(200);
    expect(en.body.data.text).toBe('Please sign in to continue');
    const region = await request(app.getHttpServer()).get('/api/v1/probe/hello').set('Accept-Language', 'en-US,en;q=0.9').expect(200);
    expect(region.body.data.text).toBe('Please sign in to continue');
    const unknown = await request(app.getHttpServer()).get('/api/v1/probe/hello').set('Accept-Language', 'ja').expect(200);
    expect(unknown.body.data.text).toBe('Bạn cần đăng nhập để tiếp tục'); // ngôn ngữ chưa hỗ trợ → fallback vi
    const q = await request(app.getHttpServer()).get('/api/v1/probe/hello?lang=en').expect(200);
    expect(q.body.data.text).toBe('Bạn cần đăng nhập để tiếp tục'); // query KHÔNG được nhận: một cách duy nhất là header
  });

  it('lỗi có message đã dịch theo Accept-Language: mã nghiệp vụ vi/en, VALIDATION_FAILED, 404 route lạ', async () => {
    const id = '00000000-0000-7000-8000-000000000000';
    const vi = await request(app.getHttpServer()).get(`/api/v1/probe/${id}`).expect(404);
    expect(vi.body.msg).toBe('Không tìm thấy dữ liệu');
    const en = await request(app.getHttpServer()).get(`/api/v1/probe/${id}`).set('Accept-Language', 'en').expect(404);
    expect(en.body.msg).toBe('Resource not found');
    const bad = await request(app.getHttpServer()).post('/api/v1/probe').send({}).set('Accept-Language', 'en').expect(422);
    expect(bad.body.msg).toBe('The submitted data is invalid');
    const nf = await request(app.getHttpServer()).get('/api/v1/__nope').expect(404);
    expect(nf.body).toMatchObject({ success: false, code: 'NOT_FOUND', msg: 'Không tìm thấy dữ liệu', data: null }); // Nest 404 route lạ → mã chung NOT_FOUND
  });

  it('/health/ready giữ shape Terminus, không bị bọc envelope', async () => {
    const res = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.data).toBeUndefined();
  });
});
