import { type ArgumentsHost, HttpStatus, NotFoundException } from '@nestjs/common';
import { AllExceptionsFilter, AppException, ErrorCodes } from '../../src/common/http/exceptions.js';

function host(req: Record<string, unknown>, res: Record<string, unknown>): ArgumentsHost {
  return { switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) } as unknown as ArgumentsHost;
}

function fakeRes(headersSent = false) {
  const calls: { status?: number; body?: unknown } = {};
  const res = {
    headersSent,
    status(code: number) {
      calls.status = code;
      return res;
    },
    json(body: unknown) {
      calls.body = body;
      return res;
    },
  };
  return { res, calls };
}

describe('AppException', () => {
  it('status mặc định theo ErrorCodes, override được', () => {
    expect(new AppException('NOT_FOUND').getStatus()).toBe(404);
    expect(new AppException('RATE_LIMITED', { retryAfter: 3 }).getStatus()).toBe(429);
    expect(new AppException('BAD_REQUEST', {}, HttpStatus.I_AM_A_TEAPOT).getStatus()).toBe(418);
    expect(ErrorCodes.VALIDATION_FAILED).toBe(422);
  });
});

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();
  const req = { id: 'req-1', method: 'GET', originalUrl: '/api/v1/x', path: '/api/v1/x' };

  it('AppException → { error: { code, params, requestId } } với status của nó', () => {
    const { res, calls } = fakeRes();
    filter.catch(new AppException('FORBIDDEN', { missing: ['pin:create'] }), host(req, res));
    expect(calls.status).toBe(403);
    expect(calls.body).toEqual({ error: { code: 'FORBIDDEN', params: { missing: ['pin:create'] }, requestId: 'req-1' } });
  });

  it('HttpException của Nest map sang mã dự án', () => {
    const { res, calls } = fakeRes();
    filter.catch(new NotFoundException('Cannot GET /x'), host(req, res));
    expect(calls.status).toBe(404);
    expect((calls.body as { error: { code: string } }).error.code).toBe('NOT_FOUND');
  });

  it('lỗi lạ → 500 INTERNAL, không lộ message', () => {
    const { res, calls } = fakeRes();
    filter.catch(new Error('db password leaked'), host(req, res));
    expect(calls.status).toBe(500);
    expect(JSON.stringify(calls.body)).not.toContain('leaked');
    expect((calls.body as { error: { code: string } }).error.code).toBe('INTERNAL');
  });

  it('headers đã gửi → không ghi thêm', () => {
    const { res, calls } = fakeRes(true);
    filter.catch(new Error('late'), host(req, res));
    expect(calls.status).toBeUndefined();
  });

  it('/health/* giữ nguyên body của Terminus', () => {
    const { res, calls } = fakeRes();
    const terminus = new (class extends AppException {})('SERVICE_UNAVAILABLE');
    filter.catch(
      Object.assign(terminus, { getResponse: () => ({ status: 'error', info: {}, error: { db: { status: 'down' } } }) }),
      host({ ...req, path: '/health/ready' }, res),
    );
    expect(calls.status).toBe(503);
    expect(calls.body).toEqual({ status: 'error', info: {}, error: { db: { status: 'down' } } });
  });
});
