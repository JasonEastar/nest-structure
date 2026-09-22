import { ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Inject, Logger } from '@nestjs/common';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import type { Request, Response } from 'express';
import * as Sentry from '@sentry/nestjs';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { z } from 'zod';
import { DEFAULT_LOCALE } from '../../config/i18n.js';
import { requestIdOf } from './request-context.middleware.js';
import type { ApiResponse } from './response.js';

/**
 * Mã lỗi dùng chung cho mọi module (theo HTTP status), câu dịch cùng tên trong i18n/{vi,en}/errors.json.
 * Ném: `throw new AppException('NOT_FOUND', { id })` — object thứ 2 là tham số, trả nguyên cho client trong `meta`
 * (id, field, count, max, missing…) để client hiển thị/xử lý; không cần mã riêng cho từng bảng.
 */
export const ErrorCodes = {
  BAD_REQUEST: HttpStatus.BAD_REQUEST, // meta.field
  UNAUTHENTICATED: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN, // meta.missing (thiếu permission) · meta.code (role/permission hệ thống)
  ACCOUNT_BLOCKED: HttpStatus.FORBIDDEN, // riêng vì app phải đăng xuất, không phải "thiếu quyền"
  NOT_FOUND: HttpStatus.NOT_FOUND, // meta.id | meta.code
  CONFLICT: HttpStatus.CONFLICT, // meta.field (đã tồn tại) · meta.count (đang được dùng) · meta.max (đạt giới hạn)
  PAYLOAD_TOO_LARGE: HttpStatus.PAYLOAD_TOO_LARGE,
  VALIDATION_FAILED: HttpStatus.UNPROCESSABLE_ENTITY, // meta.issues[{ path, message }]
  RATE_LIMITED: HttpStatus.TOO_MANY_REQUESTS, // meta.retryAfter
  INTERNAL: HttpStatus.INTERNAL_SERVER_ERROR,
  SERVICE_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
} as const;

export type ErrorCode = keyof typeof ErrorCodes;
export type ErrorParams = Record<string, unknown>;

/**
 * Một lỗi validate trong VALIDATION_FAILED. Filter dịch `message` theo Accept-Language: key `validation.<x>` (custom refine/regex
 * trong DTO, hoặc service ném) → i18n/<lang>/validation.json với `args`; còn lại là lỗi zod gốc → zod locale (vi/en).
 * Client chỉ nhận { path, message }.
 */
export interface ValidationIssue {
  path: string;
  message: string;
  args?: Record<string, unknown>;
  zod?: StandardSchemaV1.Issue;
}

/** Lỗi nghiệp vụ: `throw new AppException('NOT_FOUND', { id })`. Status lấy từ ErrorCodes, không tự đặt. */
export class AppException extends HttpException {
  constructor(
    readonly code: ErrorCode,
    readonly params: ErrorParams = {},
  ) {
    super({ code, params }, ErrorCodes[code]);
  }
}

/** Lỗi theo field từ service (vd mã role không tồn tại): `throw validationError([{ path: 'roles', message: 'validation.role_not_found', args: { code } }])`. */
export const validationError = (issues: ValidationIssue[]) => new AppException('VALIDATION_FAILED', { issues });

/** HttpException có sẵn của Nest (route không có, body quá lớn…) → mã chung theo status. */
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
 * msg = errors.<code> dịch theo Accept-Language (thiếu câu → trả mã). 5xx log stack + Sentry, không lộ ra client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(@Inject(I18nService) private readonly i18n: Pick<I18nService, 't'>) {}

  /** issues[] của VALIDATION_FAILED: key `validation.*` → i18n; lỗi zod gốc → zod locale theo ngôn ngữ; còn lại giữ nguyên. */
  translateIssues(lang: string, issues: ValidationIssue[]): { path: string; message: string }[] {
    const locale = lang === 'vi' ? z.locales.vi().localeError : undefined;
    const fromZod = (issue: unknown): string | undefined => {
      const out = locale?.(issue as Parameters<NonNullable<typeof locale>>[0]);
      return typeof out === 'string' ? out : out?.message;
    };
    return issues.map(({ path, message, args, zod }) => ({
      path,
      message: message.startsWith('validation.') ? (this.lookup(lang, message, args) ?? message) : ((zod && fromZod(zod)) || message),
    }));
  }

  /** Câu lỗi theo ngôn ngữ: errors.<code> với params làm {args}; thiếu câu dịch → trả mã. */
  translate(lang: string, code: ErrorCode, params: ErrorParams): string {
    return this.lookup(lang, `errors.${code}`, params) ?? code;
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
    if (Array.isArray(params.issues)) params = { ...params, issues: this.translateIssues(lang, params.issues as ValidationIssue[]) };
    // params trải vào meta (issues, count, retryAfter…); requestId đặt sau cùng để không bị params ghi đè
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
