import { type ExecutionContext, SetMetadata, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';

/** `@Public()` trên route/class: AuthGuard bỏ qua, không cần token. */
export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** `@RequirePermissions(['pin:create'])`: PermissionGuard kiểm user có đủ quyền (đọc từ DB qua cache). */
export const PERMISSIONS = 'permissions';
export const RequirePermissions = (permissions: string[]) => SetMetadata(PERMISSIONS, permissions);

/** `@CurrentUser() user: AuthUser` — user do AuthGuard gắn vào request. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<Request>().user;
});
