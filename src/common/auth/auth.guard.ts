import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC } from './decorators.js';
import { AppException } from '../http/exceptions.js';
import type { SupabaseClaims } from './supabase.js';
import { SupabaseJwtService } from './supabase.js';

/** Cổng tới UserService (common không import modules/). UserModule provide AUTH_USER = UserService. */
export interface AuthUser {
  id: string;
  email?: string | null;
}
export interface AuthUserPort {
  /** Tạo profile + role `user` ở request đầu tiên (idempotent). */
  ensureProfile(claims: SupabaseClaims): Promise<AuthUser>;
  /** Quyền hiệu lực (cache 5 phút). */
  getPermissions(userId: string): Promise<string[]>;
}
export const AUTH_USER = Symbol('AUTH_USER');

/** Xác thực mọi request trừ @Public(). Guard thứ 2 sau Throttler. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: SupabaseJwtService,
    @Inject(AUTH_USER) private readonly users: AuthUserPort,
  ) {}

  /** Route @Public → cho qua. Còn lại: Bearer → verify JWKS → ensureProfile → req.user; sai → 401. */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()])) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const [scheme, token] = (req.header('authorization') ?? '').split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) throw new AppException('UNAUTHENTICATED');

    const claims = await this.jwt.verify(token);
    req.user = await this.users.ensureProfile(claims);
    return true;
  }
}
