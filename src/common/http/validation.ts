import { type Provider, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { z } from 'zod';
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

/** Text người dùng nhập: trim, bỏ thẻ HTML, giới hạn độ dài (skill security-sanitize-output). */
const HTML_TAG = /<[^>]*>/g;
export const zText = (max: number, min = 1) =>
  z
    .string()
    .trim()
    .transform((s) => s.replace(HTML_TAG, ''))
    .pipe(z.string().min(min).max(max));

/** Toạ độ WGS84 (lat trước, lng sau — cùng thứ tự với LatLng của columns.ts). */
export const zLatLng = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
