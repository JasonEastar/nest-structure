import { Injectable, Logger } from '@nestjs/common';
import type { AuthUser, AuthUserPort } from '../../common/auth/auth.guard.js';
import { AppException } from '../../common/http/exceptions.js';
import { CacheService, TTL, cacheKeys } from '../../common/redis/cache.js';
import { InjectSupabaseAdmin, type SupabaseAdminPort, type SupabaseClaims } from '../../common/auth/supabase.js';
import type { MeResponse } from './dto/me.dto.js';
import type { RoleCode } from './dto/role.dto.js';
import { IdentityRepository } from './identity.repository.js';

@Injectable()
export class IdentityService implements AuthUserPort {
  private readonly logger = new Logger(IdentityService.name);

  constructor(
    private readonly repo: IdentityRepository,
    private readonly cache: CacheService,
    @InjectSupabaseAdmin() private readonly supabaseAdmin: SupabaseAdminPort,
  ) {}

  /**
   * Thay cho trigger DB (Postgres và Supabase là hai database — ADR-0005).
   * Flag Redis 1 giờ để request thứ hai trở đi không chạm DB.
   */
  async ensureProfile(claims: SupabaseClaims): Promise<AuthUser> {
    // Token còn hạn sau DELETE /me không được làm profile "sống lại" (Supabase JWT stateless, không thu hồi được).
    if (await this.cache.has(cacheKeys.deleted(claims.sub))) throw new AppException('UNAUTHENTICATED');
    const flagKey = cacheKeys.profileExists(claims.sub);
    if (!(await this.cache.has(flagKey))) {
      await this.repo.insertProfileIfMissing(claims);
      await this.cache.flag(flagKey, TTL.profileExists);
    }
    return { id: claims.sub, email: claims.email ?? null };
  }

  /** Quyền hiệu lực: cache 5 phút; admin đổi role → DEL ngay (thu hồi không đợi token hết hạn). */
  async getPermissions(userId: string): Promise<string[]> {
    const key = cacheKeys.perms(userId);
    const cached = await this.cache.getJson<string[]>(key);
    if (cached) return cached;
    const codes = await this.repo.findPermissionCodes(userId);
    await this.cache.setJson(key, codes, TTL.perms);
    return codes;
  }

  /** Ghi `devices.last_seen_at` tối đa 1 lần / 5 phút / thiết bị (không UPDATE mỗi request). */
  async touchDevice(userId: string, deviceId: string): Promise<void> {
    const key = cacheKeys.deviceSeen(userId, deviceId);
    if (await this.cache.has(key)) return;
    await this.repo.upsertDevice(userId, deviceId);
    await this.cache.flag(key, TTL.deviceSeen);
  }

  async getMe(userId: string): Promise<MeResponse> {
    const profile = await this.repo.findProfile(userId);
    if (!profile) throw new AppException('NOT_FOUND', { resource: 'profile' });
    const [roles, permissions] = await Promise.all([
      this.repo.findRoleCodes(userId),
      this.getPermissions(userId),
    ]);
    return {
      id: profile.id,
      email: profile.email,
      displayName: profile.displayName,
      username: profile.username,
      avatarUrl: profile.avatarUrl,
      locale: profile.locale,
      homeCityCode: profile.homeCityCode,
      phoneVerified: profile.phoneVerifiedAt !== null,
      roles,
      permissions,
    };
  }

  async listRoles() {
    return this.repo.listRoles();
  }

  async listUserRoles(userId: string): Promise<RoleCode[]> {
    return this.repo.findRoleCodes(userId);
  }

  /** Gán lại role cho user. Xoá cache quyền để hiệu lực tức thì trên mọi instance. */
  async setUserRoles(userId: string, codes: RoleCode[]): Promise<{ id: string; roles: RoleCode[] }> {
    if (!(await this.repo.profileExists(userId))) {
      throw new AppException('NOT_FOUND', { resource: 'profile', id: userId });
    }
    await this.repo.replaceUserRoles(userId, codes);
    await this.cache.del(cacheKeys.perms(userId));
    return { id: userId, roles: await this.repo.findRoleCodes(userId) };
  }

  /**
   * Xoá tài khoản: local trước (tx + cascade), Supabase sau. Idempotent — gọi lại được nếu bước sau lỗi.
   */
  async deleteMe(userId: string): Promise<void> {
    await this.repo.deleteProfile(userId);
    await this.cache.del(cacheKeys.perms(userId), cacheKeys.profileExists(userId));
    await this.cache.flag(cacheKeys.deleted(userId), TTL.deletedTombstone);
    try {
      await this.supabaseAdmin.deleteUser(userId);
    } catch (error) {
      this.logger.error(`supabase deleteUser failed for ${userId}: ${String(error)}`);
      throw new AppException('INTERNAL');
    }
  }
}
