import { readFileSync } from 'node:fs';
import { type ArgumentsHost, HttpStatus, NotFoundException } from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';

// Chỉ mock SDK bên ngoài để biết filter có gọi captureException đúng lúc; logic filter chạy thật
vi.mock('@sentry/nestjs', () => ({ captureException: vi.fn() }));
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
 * → kiểm được errors.<code> + args, và fallback về mã khi thiếu câu. Bản dịch thật: test 'đủ câu vi + en' bên dưới.
 */
const dictionary: Record<string, string> = {
  'vi:errors.FORBIDDEN': 'Không có quyền',
  'vi:errors.CONFLICT': 'Xung đột ({count})',
  'en:errors.CONFLICT': 'Conflict ({count})',
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
  it('status lấy từ ErrorCodes theo mã', () => {
    expect(new AppException('NOT_FOUND', { id: 'x' }).getStatus()).toBe(404);
    expect(new AppException('CONFLICT', { count: 2 }).getStatus()).toBe(409);
    expect(new AppException('RATE_LIMITED', { retryAfter: 3 }).getStatus()).toBe(429);
    expect(ErrorCodes.VALIDATION_FAILED).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
  });

  it('mọi mã lỗi đều có câu dịch vi và en', () => {
    for (const lang of ['vi', 'en']) {
      const messages = JSON.parse(readFileSync(`i18n/${lang}/errors.json`, 'utf8')) as Record<string, string>;
      for (const code of Object.keys(ErrorCodes)) expect(messages[code], `${lang}: ${code}`).toBeTruthy();
    }
  });
});

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter(i18n as never);
  const req = { id: 'req-1', method: 'GET', originalUrl: '/api/v1/x', path: '/api/v1/x' };

  it('AppException → { error: { code, message, params, requestId } } với status của nó; ngôn ngữ mặc định vi', () => {
    const { res, calls } = fakeRes();
    filter.catch(new AppException('FORBIDDEN', { missing: ['pin:create'] }), host(req, res));
    expect(calls.status).toBe(403);
    expect(calls.body).toEqual({
      success: false,
      code: 'FORBIDDEN',
      msg: 'Không có quyền',
      data: null,
      meta: { missing: ['pin:create'], requestId: 'req-1' },
    });
  });

  it('translate: errors.<code> với args theo ngôn ngữ; thiếu câu dịch → trả mã', () => {
    expect(filter.translate('vi', 'CONFLICT', { count: 3 })).toBe('Xung đột (3)');
    expect(filter.translate('en', 'CONFLICT', { count: 3 })).toBe('Conflict (3)');
    expect(filter.translate('vi', 'RATE_LIMITED', { retryAfter: 3 })).toBe('RATE_LIMITED');
  });

  it('HttpException của Nest map sang mã dự án', () => {
    const { res, calls } = fakeRes();
    filter.catch(new NotFoundException('Cannot GET /x'), host(req, res));
    expect(calls.status).toBe(404);
    expect((calls.body as { code: string }).code).toBe('NOT_FOUND');
  });

  it('lỗi lạ → 500 INTERNAL, không lộ message, gửi Sentry kèm requestId; 4xx không gửi', () => {
    vi.mocked(Sentry.captureException).mockClear();
    const { res, calls } = fakeRes();
    const boom = new Error('db password leaked');
    filter.catch(boom, host(req, res));
    expect(calls.status).toBe(500);
    expect(JSON.stringify(calls.body)).not.toContain('leaked');
    expect((calls.body as { code: string }).code).toBe('INTERNAL');
    expect(Sentry.captureException).toHaveBeenCalledWith(boom, { tags: { requestId: 'req-1' }, extra: { code: 'INTERNAL' } });

    filter.catch(new NotFoundException(), host(req, fakeRes().res));
    expect(Sentry.captureException).toHaveBeenCalledTimes(1); // 404 không phải lỗi hệ thống
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
