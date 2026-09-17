import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { type AuthUserPort, AUTH_USER } from './auth.guard.js';
import { RequirePermissions } from './decorators.js';
import { AppException } from '../http/exceptions.js';

/**
 * Kiểm quyền `resource:action` từ DB (cache Redis 5 phút) — NEVER đọc role/permission từ JWT,
 * để admin thu hồi quyền có hiệu lực ngay mà không cần đợi token hết hạn.
 * Guard cuối chuỗi: Throttler → Auth → Permission.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH_USER) private readonly users: AuthUserPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride(RequirePermissions, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const user = context.switchToHttp().getRequest<Request>().user;
    if (!user) throw new AppException('UNAUTHENTICATED');

    const granted = new Set(await this.users.getPermissions(user.id));
    const missing = required.filter((permission: string) => !granted.has(permission));
    if (missing.length) throw new AppException('FORBIDDEN', { missing });
    return true;
  }
}
