import { type CanActivate, type ExecutionContext, Inject, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Public } from './decorators.js';
import { AppException } from '../http/exceptions.js';
import type { SupabaseClaims } from './supabase.js';
import { SupabaseJwtService } from './supabase.js';

/**
 * Cổng tới module identity — common KHÔNG import modules/ (code-standards §2.2).
 * IdentityModule cung cấp `{ provide: AUTH_USER, useExisting: IdentityService }`.
 */
export interface AuthUser {
  id: string;
  email?: string | null;
  locale?: string;
}
export interface AuthUserPort {
  /** Tạo profile + role `user` ở request đầu tiên của một `sub` (idempotent, an toàn đa instance). */
  ensureProfile(claims: SupabaseClaims): Promise<AuthUser>;
  /** Quyền hiệu lực của user (cache Redis 5 phút, nguồn là bảng RBAC). */
  getPermissions(userId: string): Promise<string[]>;
  /** Ghi nhận thiết bị từ header `x-device-id` (throttle ghi, không chặn request). */
  touchDevice(userId: string, deviceId: string): Promise<void>;
}
export const AUTH_USER = Symbol('AUTH_USER');

const DEVICE_ID = /^[A-Za-z0-9._-]{8,128}$/;

/**
 * Xác thực mọi request trừ `@Public()`: Bearer → verify JWKS Supabase → ensureProfile → `req.user`.
 * Guard thứ hai trong chuỗi (sau Throttler), trước PermissionGuard.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: SupabaseJwtService,
    @Inject(AUTH_USER) private readonly users: AuthUserPort,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride(Public, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const [scheme, token] = (req.header('authorization') ?? '').split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) throw new AppException('UNAUTHENTICATED');

    const claims = await this.jwt.verify(token);
    req.user = await this.users.ensureProfile(claims);

    const deviceId = req.header('x-device-id');
    if (deviceId && DEVICE_ID.test(deviceId)) {
      // fire-and-forget: lỗi ghi thiết bị không được làm hỏng request (code-standards §2.7)
      void this.users
        .touchDevice(req.user.id, deviceId)
        .catch((error: unknown) => this.logger.warn(`touchDevice failed: ${String(error)}`));
    }
    return true;
  }
}
