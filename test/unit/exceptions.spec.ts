import { type ArgumentsHost, HttpStatus, NotFoundException } from '@nestjs/common';
import { AllExceptionsFilter, AppException, ErrorCodes } from '../../src/common/http/exceptions.js';

function host(req: Record<string, unknown>, res: Record<string, unknown>): ArgumentsHost {
  // getType/getArgs: nestjs-i18n (I18nContext.current) đọc để tìm ngữ cảnh; không có middleware i18n → trả undefined → vi
  return {
    getType: () => 'http',
    getArgs: () => [req, res],
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ArgumentsHost;
}

/**
 * Bộ dịch giả cùng interface I18nService.t: chỉ biết vài key, key lạ trả lại chính key (đúng hành vi nestjs-i18n)
 * → kiểm được thứ tự tìm CODE_<reason> → CODE → mã lỗi và dịch resource. Bản dịch thật kiểm ở integration.
 */
const dictionary: Record<string, string> = {
  'vi:errors.FORBIDDEN': 'Không có quyền',
  'vi:errors.NOT_FOUND': 'Không tìm thấy {resource}',
  'vi:errors.resource.location': 'địa điểm',
  'vi:errors.CONFLICT': 'Xung đột',
  'vi:errors.CONFLICT_LIMIT_REACHED': 'Đã đạt giới hạn {max}',
  'en:errors.NOT_FOUND': '{resource} not found',
};
const i18n = {
  t: (key: string, opts?: { lang?: string; args?: Record<string, unknown> }) => {
    const text = dictionary[`${opts?.lang ?? 'vi'}:${key}`];
    return text ? text.replace(/\{(\w+)\}/g, (_m, k: string) => String(opts?.args?.[k] ?? '')) : key;
  },
};

function fakeRes(headersSent = false) {
  const calls: { status?: number; body?: unknown; headers: Record<string, string> } = { headers: {} };
  const res = {
    headersSent,
    setHeader(name: string, value: string) {
      calls.headers[name] = value;
    },
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
  const filter = new AllExceptionsFilter(i18n as never);
  const req = { id: 'req-1', method: 'GET', originalUrl: '/api/v1/x', path: '/api/v1/x' };

  it('AppException → { error: { code, message, params, requestId } } với status của nó; Content-Language mặc định vi', () => {
    const { res, calls } = fakeRes();
    filter.catch(new AppException('FORBIDDEN', { missing: ['pin:create'] }), host(req, res));
    expect(calls.status).toBe(403);
    expect(calls.body).toEqual({
      error: { code: 'FORBIDDEN', message: 'Không có quyền', params: { missing: ['pin:create'] }, requestId: 'req-1' },
    });
    expect(calls.headers['Content-Language']).toBe('vi');
  });

  it('translate: CODE_<reason> ưu tiên hơn CODE; resource được dịch; thiếu câu dịch → trả mã', () => {
    expect(filter.translate('vi', 'CONFLICT', { reason: 'LIMIT_REACHED', max: 20 })).toBe('Đã đạt giới hạn 20');
    expect(filter.translate('vi', 'CONFLICT', { reason: 'UNKNOWN' })).toBe('Xung đột');
    expect(filter.translate('vi', 'NOT_FOUND', { resource: 'location' })).toBe('Không tìm thấy địa điểm');
    expect(filter.translate('en', 'NOT_FOUND', { resource: 'probe' })).toBe('probe not found');
    expect(filter.translate('vi', 'RATE_LIMITED', { retryAfter: 3 })).toBe('RATE_LIMITED');
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
