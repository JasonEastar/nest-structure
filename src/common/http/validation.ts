import { type Provider, StandardSchemaValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { z } from 'zod';
import { AppException } from './exceptions.js';

/** Pipe zod toàn cục (có sẵn Nest 12): `@Body({ schema })`, `@Param('id', { schema })`. Sai → 422 với issues[{ path, message }]. */
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

/** Text người dùng nhập: trim, bỏ thẻ HTML (kể cả thẻ không đóng `<img src=x` → bỏ luôn `<` `>` còn sót), giới hạn độ dài. */
const HTML_TAG = /<[^>]*>/g;
const ANGLE_BRACKET = /[<>]/g;
export const zText = (max: number, min = 1) =>
  z
    .string()
    .trim()
    .transform((s) => s.replace(HTML_TAG, '').replace(ANGLE_BRACKET, '').trim())
    .pipe(z.string().min(min).max(max));

/** Toạ độ WGS84. */
export const zLatLng = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
