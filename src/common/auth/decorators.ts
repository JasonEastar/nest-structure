import { type ExecutionContext, SetMetadata, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';
import type { Permission } from './permissions.js';

/** `@Public()` trên route/class: AuthGuard bỏ qua, không cần token. */
export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** `@RequirePermission('pin:create')` (nhiều quyền: `@RequirePermission('a', 'b')`, cần đủ cả). PermissionGuard kiểm qua DB + cache.
 * Mã lấy từ `permissions.ts` nên gõ sai là lỗi compile. */
export const PERMISSIONS_KEY = 'permissions';
export const RequirePermission = (...permissions: Permission[]) => SetMetadata(PERMISSIONS_KEY, permissions);

/** `@CurrentUser() user: AuthUser` — user do AuthGuard gắn vào request. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<Request>().user;
});
