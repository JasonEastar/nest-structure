import { type Provider, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { AppException } from './exceptions.js';

/**
 * Pipe validate toàn cục — có sẵn trong Nest 12, không cần class-validator/nestjs-zod.
 * Controller gắn schema ngay trên decorator: `@Body({ schema: CreateXSchema })`, `@Param('id', { schema: z.uuid() })`.
 * Lỗi → 422 VALIDATION_FAILED, params.issues = [{ path, message }].
 */
export const ValidationPipeProvider: Provider = {
  provide: APP_PIPE,
  useFactory: () =>
    new StandardSchemaValidationPipe({
      transform: true,
      exceptionFactory: (issues: readonly StandardSchemaV1.Issue[]) =>
        new AppException('VALIDATION_FAILED', {
          issues: issues.map((issue) => ({
            path: (issue.path ?? [])
              .map((p) => (typeof p === 'object' && p !== null && 'key' in p ? String(p.key) : String(p)))
              .join('.'),
            message: issue.message,
          })),
        }),
    }),
};
