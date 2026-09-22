import { type ExecutionContext, SetMetadata, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';

/** `@Public()` trên route/class: AuthGuard bỏ qua, không cần token. */
export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** `@RequirePermission('pin:create')` (nhiều quyền: `@RequirePermission('a', 'b')`, cần đủ cả). PermissionGuard so với quyền của user (DB + cache).
 * Mã là chuỗi `resource:action` trùng với bảng `permissions` (admin quản lý) — gõ sai mã = route không ai vào được, tự kiểm khi viết route. */
export const PERMISSIONS_KEY = 'permissions';
export const RequirePermission = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);

/** `@CurrentUser() user: AuthUser` — user do AuthGuard gắn vào request. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<Request>().user;
});
