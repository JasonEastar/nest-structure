import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { type AuthUserPort, AUTH_USER } from './auth.guard.js';
import { PERMISSIONS } from './decorators.js';
import { AppException } from '../http/exceptions.js';

/** Kiểm quyền từ DB qua cache (không đọc từ JWT, để thu hồi có hiệu lực ngay). Guard cuối chuỗi. */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(AUTH_USER) private readonly users: AuthUserPort,
  ) {}

  /** Không có @RequirePermissions → cho qua. Có → so quyền của user (cache) với danh sách yêu cầu; thiếu → 403. */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS, [context.getHandler(), context.getClass()]);
    if (!required?.length) return true;

    const user = context.switchToHttp().getRequest<Request>().user;
    if (!user) throw new AppException('UNAUTHENTICATED');

    const granted = new Set(await this.users.getPermissions(user.id));
    const missing = required.filter((permission: string) => !granted.has(permission));
    if (missing.length) throw new AppException('FORBIDDEN', { missing });
    return true;
  }
}
