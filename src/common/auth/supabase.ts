import { Injectable, Logger, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Env } from '../../config/env.js';
import { AppException } from '../http/exceptions.js';

/** Supabase chỉ làm Auth: phát JWT (Google), quản lý user. App chỉ verify bằng JWKS, không phát token. */

/** Claims app dùng (role/permission KHÔNG lấy từ token). */
export interface SupabaseClaims {
  sub: string;
  email?: string;
  isAnonymous: boolean;
  fullName?: string;
  avatarUrl?: string;
}

/** Cổng tới Supabase Admin API (test thay bằng in-memory). */
export interface SupabaseAdminPort {
  /** Admin tạo tài khoản email + mật khẩu (đã xác nhận email). Email trùng → CONFLICT EMAIL_TAKEN; yếu → VALIDATION_FAILED. */
  createUser(input: { email: string; password: string; displayName: string }): Promise<{ id: string }>;
  deleteUser(userId: string): Promise<void>;
  getUserById(userId: string): Promise<{ id: string; email?: string; phoneConfirmedAt?: string | null } | null>;
}
export const SUPABASE_ADMIN = Symbol('SUPABASE_ADMIN'); // inject: `@Inject(SUPABASE_ADMIN) admin: SupabaseAdminPort`

@Injectable()
export class SupabaseJwtService {
  private readonly logger = new Logger(SupabaseJwtService.name);
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer: string;

  constructor(config: ConfigService<Env, true>) {
    const url = config.get('SUPABASE_URL', { infer: true }).replace(/\/$/, '');
    this.issuer = `${url}/auth/v1`;
    const jwksUrl = config.get('SUPABASE_JWKS_URL', { infer: true }) ?? `${this.issuer}/.well-known/jwks.json`;
    // JWKS được cache theo kid, không fetch mỗi request. Project phải bật JWT signing keys (ES256).
    this.jwks = createRemoteJWKSet(new URL(jwksUrl));
  }

  /** Mọi lỗi verify → UNAUTHENTICATED; lý do chỉ ghi log debug. */
  async verify(token: string): Promise<SupabaseClaims> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: 'authenticated',
        algorithms: ['ES256', 'RS256'], // ghim: HS256/none bị từ chối
        clockTolerance: 5,
      });
      const meta = (payload.user_metadata ?? {}) as Record<string, unknown>;
      const claims: SupabaseClaims = {
        sub: String(payload.sub),
        email: typeof payload.email === 'string' ? payload.email : undefined,
        isAnonymous: payload.is_anonymous === true,
        fullName: typeof meta.full_name === 'string' ? meta.full_name : undefined,
        avatarUrl: typeof meta.avatar_url === 'string' ? meta.avatar_url : undefined,
      };
      if (!claims.sub) throw new Error('missing sub');
      if (claims.isAnonymous) throw new Error('anonymous sign-in disabled');
      return claims;
    } catch (error) {
      this.logger.debug(`jwt verify failed: ${error instanceof Error ? error.message : String(error)}`);
      throw new AppException('UNAUTHENTICATED');
    }
  }
}

/** Adapter thật với secret key, chỉ chạy ở server. */
@Injectable()
export class SupabaseAdminAdapter implements SupabaseAdminPort {
  private readonly client: SupabaseClient;

  constructor(config: ConfigService<Env, true>) {
    this.client = createClient(
      config.get('SUPABASE_URL', { infer: true }),
      config.get('SUPABASE_SECRET_KEY', { infer: true }),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }

  /** Supabase giữ mật khẩu (bcrypt); `must_change_password` để admin web ép đổi ở lần đăng nhập đầu. */
  async createUser(input: { email: string; password: string; displayName: string }): Promise<{ id: string }> {
    const { data, error } = await this.client.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { full_name: input.displayName },
      app_metadata: { must_change_password: true },
    });
    if (error) {
      if (error.code === 'email_exists') throw new AppException('CONFLICT', { reason: 'EMAIL_TAKEN', field: 'email' });
      if (error.code === 'weak_password') {
        throw new AppException('VALIDATION_FAILED', { issues: [{ path: 'password', message: error.message }] });
      }
      throw error;
    }
    return { id: data.user.id };
  }

  /** Xoá user trên Supabase Auth. Đã xoá trước đó (404) → coi như thành công. */
  async deleteUser(userId: string): Promise<void> {
    const { error } = await this.client.auth.admin.deleteUser(userId);
    if (error && error.status !== 404) throw error;
  }

  /** Đọc user từ Supabase Auth; null nếu không tồn tại. */
  async getUserById(userId: string) {
    const { data, error } = await this.client.auth.admin.getUserById(userId);
    if (error) {
      if (error.status === 404) return null;
      throw error;
    }
    return data.user
      ? { id: data.user.id, email: data.user.email, phoneConfirmedAt: data.user.phone_confirmed_at ?? null }
      : null;
  }
}

export const supabaseProviders: Provider[] = [
  SupabaseJwtService,
  { provide: SUPABASE_ADMIN, useClass: SupabaseAdminAdapter },
];
