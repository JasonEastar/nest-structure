import { ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Inject, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import * as Sentry from '@sentry/nestjs';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { DEFAULT_LOCALE } from '../../config/i18n.js';
import { requestIdOf } from './request-context.middleware.js';
import type { ApiResponse } from './response.js';

/** Mã lỗi + HTTP status mặc định. Thêm mã mới → thêm câu dịch cùng tên trong i18n/{vi,en}/errors.json. */
export const ErrorCodes = {
  VALIDATION_FAILED: HttpStatus.UNPROCESSABLE_ENTITY,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  UNAUTHENTICATED: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS,
  CONFLICT: HttpStatus.CONFLICT,
  BAD_REQUEST: HttpStatus.BAD_REQUEST,
  PAYLOAD_TOO_LARGE: HttpStatus.PAYLOAD_TOO_LARGE,
  SERVICE_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  INTERNAL: HttpStatus.INTERNAL_SERVER_ERROR,
} as const;

export type ErrorCode = keyof typeof ErrorCodes;
export type ErrorParams = Record<string, unknown>;

/** Lỗi nghiệp vụ: service ném `new AppException('NOT_FOUND', { resource: 'pin' })`. */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    readonly params: ErrorParams = {},
    status: HttpStatus = ErrorCodes[code],
  ) {
    super({ code, params }, status);
  }
}

/** Map HttpException có sẵn của Nest (NotFoundException, ...) sang mã của dự án. */
const STATUS_TO_CODE: Partial<Record<number, ErrorCode>> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'VALIDATION_FAILED',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
};

/**
 * Filter toàn cục: mọi lỗi → ApiResponse (response.ts) với success=false, data=null, chi tiết trong meta.
 * AppException giữ code/status; HttpException Nest map status → code; lỗi lạ → 500.
 * message dịch theo Accept-Language: `CODE_<reason>` → `CODE` → mã lỗi. 5xx log stack, không lộ ra client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(@Inject(I18nService) private readonly i18n: Pick<I18nService, 't'>) {}

  /** Câu lỗi theo ngôn ngữ; `params.resource` dịch qua `errors.resource.<tên>`, không có thì dùng `resource.default`. */
  translate(lang: string, code: ErrorCode, params: ErrorParams): string {
    const args = { ...params };
    const resource = typeof params.resource === 'string' ? params.resource : 'default';
    args.resource = this.lookup(lang, `errors.resource.${resource}`) ?? resource;
    const byReason = typeof params.reason === 'string' ? this.lookup(lang, `errors.${code}_${params.reason}`, args) : undefined;
    return byReason ?? this.lookup(lang, `errors.${code}`, args) ?? code;
  }

  /** nestjs-i18n trả lại key khi thiếu câu dịch → undefined để fallback. */
  private lookup(lang: string, key: string, args?: ErrorParams): string | undefined {
    const text = this.i18n.t(key as never, { lang, args }) as unknown;
    return typeof text === 'string' && text !== key ? text : undefined;
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const requestId = requestIdOf(req);

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ErrorCode = 'INTERNAL';
    let params: ErrorParams = {};

    if (exception instanceof AppException) {
      status = exception.getStatus();
      code = exception.code;
      params = exception.params;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = STATUS_TO_CODE[status] ?? (status >= 500 ? 'INTERNAL' : 'BAD_REQUEST');
    }

    if (status >= 500) {
      Sentry.captureException(exception, { tags: { requestId }, extra: { code } }); // no-op khi không có DSN
      this.logger.error(
        `${req.method} ${req.originalUrl} → ${status} ${code} requestId=${requestId}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    if (res.headersSent) return; // đã bắt đầu gửi (stream) → không ghi thêm
    // /health/*: giữ body của Terminus cho probe đọc
    if (req.path.startsWith('/health') && exception instanceof HttpException) {
      res.status(status).json(exception.getResponse());
      return;
    }
    const lang = I18nContext.current(host)?.lang ?? DEFAULT_LOCALE;
    // params trải vào meta (issues, reason, retryAfter…); requestId đặt sau cùng để không bị params ghi đè
    const body: ApiResponse<never> = {
      success: false,
      code,
      msg: this.translate(lang, code, params),
      data: null,
      meta: { ...params, requestId },
    };
    res.status(status).json(body);
  }
}
