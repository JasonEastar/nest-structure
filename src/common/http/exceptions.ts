import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { requestIdOf } from './request-context.middleware.js';

/**
 * Mã lỗi trả cho client (SCREAMING_SNAKE). Server KHÔNG trả câu tiếng Việt; client dịch theo mã.
 * Thêm mã mới ở đây, kèm status mặc định.
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

export interface ErrorEnvelope {
  error: { code: ErrorCode; params: ErrorParams; requestId: string };
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
 * Filter toàn cục (APP_FILTER): mọi lỗi → `{ error: { code, params, requestId } }`.
 * 5xx: log stack, không lộ chi tiết ra client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

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
    const body: ErrorEnvelope = { error: { code, params, requestId } };
    res.status(status).json(body);
  }
}
