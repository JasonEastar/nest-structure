import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';

/** Integration nền: AppModule thật trên PostGIS + Redis (testcontainers). */
describe('App (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health/live trả status ok và hostname', async () => {
    const res = await request(app.getHttpServer()).get('/health/live').expect(200);
    expect(res.body).toEqual({ status: 'ok', instance: expect.any(String) }); // probe: không theo shape API app
  });

  it('GET /health/ready báo db up khi Postgres chạy', async () => {
    const res = await request(app.getHttpServer()).get('/health/ready').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.info.db.status).toBe('up');
  });

  it('echo X-Request-Id do proxy gửi', async () => {
    const res = await request(app.getHttpServer())
      .get('/health/live')
      .set('X-Request-Id', 'req-e2e-1')
      .expect(200);
    expect(res.headers['x-request-id']).toBe('req-e2e-1');
  });
});
