import { Inject, Injectable, Logger, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Env } from '../config/env.js';
import { AppException } from './exceptions.js';

/**
 * Supabase CHỈ làm Auth (ADR-0002, ADR-0005): phát JWT (Google sign-in), quản lý user.
 * NestJS không phát hành token, chỉ verify bằng JWKS; dữ liệu nghiệp vụ nằm ở Postgres riêng.
 */

/** Claims dùng trong app (không lấy role/permission từ token — đọc từ DB). */
export interface SupabaseClaims {
  sub: string;
  email?: string;
  sessionId?: string;
  isAnonymous: boolean;
  fullName?: string;
  avatarUrl?: string;
}

/** Cổng tới Supabase Admin API — interface nhỏ để test thay bằng in-memory (skill di-use-interfaces-tokens). */
export interface SupabaseAdminPort {
  deleteUser(userId: string): Promise<void>;
  getUserById(userId: string): Promise<{ id: string; email?: string; phoneConfirmedAt?: string | null } | null>;
}
export const SUPABASE_ADMIN = Symbol('SUPABASE_ADMIN');
export const InjectSupabaseAdmin = () => Inject(SUPABASE_ADMIN);

@Injectable()
export class SupabaseJwtService {
  private readonly logger = new Logger(SupabaseJwtService.name);
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer: string;

  constructor(config: ConfigService<Env, true>) {
    const url = config.get('SUPABASE_URL', { infer: true }).replace(/\/$/, '');
    this.issuer = `${url}/auth/v1`;
    const jwksUrl = config.get('SUPABASE_JWKS_URL', { infer: true }) ?? `${this.issuer}/.well-known/jwks.json`;
    // createRemoteJWKSet tự cache theo `kid` và xoay khoá; không fetch mỗi request.
    // Project phải bật "JWT signing keys" (ES256). Legacy HS256 → JWKS rỗng → mọi token bị 401 (đúng thiết kế, ADR-0002).
    this.jwks = createRemoteJWKSet(new URL(jwksUrl));
  }

  /** Lỗi verify luôn trả UNAUTHENTICATED chung; lý do chỉ ghi log debug (không lộ cho client). */
  async verify(token: string): Promise<SupabaseClaims> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: 'authenticated',
        algorithms: ['ES256', 'RS256'], // ghim tường minh: HS256/none bị từ chối dù JWKS bị thay
        clockTolerance: 5,
      });
      const meta = (payload.user_metadata ?? {}) as Record<string, unknown>;
      const claims: SupabaseClaims = {
        sub: String(payload.sub),
        email: typeof payload.email === 'string' ? payload.email : undefined,
        sessionId: typeof payload.session_id === 'string' ? payload.session_id : undefined,
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

/** Adapter thật: service_role key, chỉ chạy ở server, không giữ session. */
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

  async deleteUser(userId: string): Promise<void> {
    const { error } = await this.client.auth.admin.deleteUser(userId);
    // User đã bị xoá trước đó → coi như thành công (idempotent).
    if (error && error.status !== 404) throw error;
  }

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
