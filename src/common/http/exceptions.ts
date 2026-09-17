import { ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Inject, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { DEFAULT_LOCALE } from '../../config/i18n.js';
import { requestIdOf } from './request-context.middleware.js';

/**
 * Mã lỗi trả cho client (SCREAMING_SNAKE) kèm HTTP status mặc định.
 * Thêm mã mới: thêm ở đây + thêm câu dịch cùng tên trong i18n/{vi,en}/errors.json.
 * Client xử lý logic theo `code`; `message` đã dịch theo ngôn ngữ request, hiển thị được ngay.
 */
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

/** Shape lỗi thống nhất cho mọi API. */
export interface ErrorEnvelope {
  error: {
    code: ErrorCode; // client rẽ nhánh theo mã này
    message: string; // đã dịch (vi/en) theo request, hiển thị thẳng cho người dùng
    params: ErrorParams; // dữ liệu phụ để client tự dịch lại nếu muốn (resource, retryAfter, issues…)
    requestId: string; // gửi kèm khi báo lỗi để tra log
  };
}

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
 * Filter toàn cục (APP_FILTER): mọi lỗi → `{ error: { code, message, params, requestId } }` (ErrorEnvelope).
 * - AppException: giữ code/params/status của nó. HttpException của Nest: map status → code. Lỗi lạ: 500 INTERNAL.
 * - `message` dịch từ i18n/errors.json theo header Accept-Language của request, tìm theo thứ tự
 *   `CODE_<reason>` (vd CONFLICT_LIMIT_REACHED) → `CODE` → chính mã lỗi nếu chưa có câu dịch.
 * - 5xx: log stack, không lộ chi tiết ra client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(@Inject(I18nService) private readonly i18n: Pick<I18nService, 't'>) {}

  /** Câu lỗi theo ngôn ngữ. `params.resource` được dịch qua `errors.resource.<tên>` nếu có (vd location → địa điểm). */
  translate(lang: string, code: ErrorCode, params: ErrorParams): string {
    const args = { ...params };
    if (typeof params.resource === 'string') {
      args.resource = this.lookup(lang, `errors.resource.${params.resource}`) ?? params.resource;
    }
    const byReason = typeof params.reason === 'string' ? this.lookup(lang, `errors.${code}_${params.reason}`, args) : undefined;
    return byReason ?? this.lookup(lang, `errors.${code}`, args) ?? code;
  }

  /** nestjs-i18n trả lại chính key khi thiếu câu dịch → coi là undefined để fallback. */
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
      this.logger.error(
        `${req.method} ${req.originalUrl} → ${status} ${code} requestId=${requestId}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    if (res.headersSent) return; // response đã bắt đầu gửi (stream): không ghi thêm, tránh ERR_HTTP_HEADERS_SENT
    // /health/*: giữ nguyên body của Terminus ({ status, info, error, details }) cho probe/người vận hành đọc
    if (req.path.startsWith('/health') && exception instanceof HttpException) {
      res.status(status).json(exception.getResponse());
      return;
    }
    const lang = I18nContext.current(host)?.lang ?? DEFAULT_LOCALE;
    res.setHeader('Content-Language', lang);
    const body: ErrorEnvelope = { error: { code, message: this.translate(lang, code, params), params, requestId } };
    res.status(status).json(body);
  }
}
