import { type ExecutionContext, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

/**
 * Metadata cho guard (Nest 12: `Reflector.createDecorator` thay `SetMetadata` — có kiểu, không lệch key).
 * - `@Public()`      : bỏ qua AuthGuard (health, docs, webhook đã ký).
 * - `@RequirePermissions('pin:create')`: PermissionGuard kiểm quyền từ DB/cache, KHÔNG từ JWT.
 */
export const Public = Reflector.createDecorator<boolean>({ transform: (value: boolean | undefined) => value ?? true });
export const RequirePermissions = Reflector.createDecorator<string[]>();

/** `@CurrentUser() user: AuthUser` — user do AuthGuard gắn vào request. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<Request>().user;
});
