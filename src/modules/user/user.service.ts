import { Injectable, Logger } from '@nestjs/common';
import type { AuthUser, AuthUserPort } from '../../common/auth/auth.guard.js';
import { AppException } from '../../common/http/exceptions.js';
import { CACHE, CacheService } from '../../common/redis/cache.js';
import { InjectSupabaseAdmin, type SupabaseAdminPort, type SupabaseClaims } from '../../common/auth/supabase.js';
import { type MeResponse, toMeResponse } from './dto/me.dto.js';
import type { RoleCode } from './dto/role.dto.js';
import { UserRepository } from './user.repository.js';

/**
 * Nghiệp vụ user: tạo profile lần đầu (thay trigger DB, vì Postgres và Supabase là 2 database), quyền hiệu lực (RBAC + cache),
 * hồ sơ /me, gán role, xoá tài khoản. Implements AuthUserPort để AuthGuard/PermissionGuard trong common/ gọi được qua AUTH_USER.
 */
@Injectable()
export class UserService implements AuthUserPort {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly repo: UserRepository,
    private readonly cache: CacheService,
    @InjectSupabaseAdmin() private readonly supabaseAdmin: SupabaseAdminPort,
  ) {}

  /**
   * Thay cho trigger DB (Postgres và Supabase là hai database — ADR-0005).
   * Flag Redis 1 giờ để request thứ hai trở đi không chạm DB.
   */
  async ensureProfile(claims: SupabaseClaims): Promise<AuthUser> {
    // Token còn hạn sau DELETE /me không được làm profile "sống lại" (Supabase JWT stateless, không thu hồi được).
    if (await this.cache.has(CACHE.deleted.key(claims.sub))) throw new AppException('UNAUTHENTICATED');
    const flagKey = CACHE.profileExists.key(claims.sub);
    if (!(await this.cache.has(flagKey))) {
      await this.repo.insertProfileIfMissing(claims);
      await this.cache.flag(flagKey, CACHE.profileExists.ttl);
    }
    return { id: claims.sub, email: claims.email ?? null };
  }

  /** Quyền hiệu lực: cache 5 phút; admin đổi role → DEL ngay (thu hồi không đợi token hết hạn). */
  async getPermissions(userId: string): Promise<string[]> {
    const key = CACHE.perms.key(userId);
    const cached = await this.cache.getJson<string[]>(key);
    if (cached) return cached;
    const codes = await this.repo.findPermissionCodes(userId);
    await this.cache.setJson(key, codes, CACHE.perms.ttl);
    return codes;
  }

  /** Ghi `devices.last_seen_at` tối đa 1 lần / 5 phút / thiết bị (không UPDATE mỗi request). */
  async touchDevice(userId: string, deviceId: string): Promise<void> {
    const key = CACHE.deviceSeen.key(userId, deviceId);
    if (await this.cache.has(key)) return;
    await this.repo.upsertDevice(userId, deviceId);
    await this.cache.flag(key, CACHE.deviceSeen.ttl);
  }

  /** Hồ sơ /me: profile + role + permission hiệu lực. */
  async getMe(userId: string): Promise<MeResponse> {
    const profile = await this.repo.findProfile(userId);
    if (!profile) throw new AppException('NOT_FOUND', { resource: 'profile' });
    const [roles, permissions] = await Promise.all([
      this.repo.findRoleCodes(userId),
      this.getPermissions(userId),
    ]);
    return toMeResponse(profile, roles, permissions);
  }

  /** Danh sách role cho admin. */
  async listRoles() {
    return this.repo.listRoles();
  }

  /** Role hiện tại của một user. */
  async listUserRoles(userId: string): Promise<RoleCode[]> {
    return this.repo.findRoleCodes(userId);
  }

  /** Gán lại role cho user. Xoá cache quyền để hiệu lực tức thì trên mọi instance. */
  async setUserRoles(userId: string, codes: RoleCode[]): Promise<{ id: string; roles: RoleCode[] }> {
    if (!(await this.repo.profileExists(userId))) {
      throw new AppException('NOT_FOUND', { resource: 'profile', id: userId });
    }
    await this.repo.replaceUserRoles(userId, codes);
    await this.cache.del(CACHE.perms.key(userId));
    return { id: userId, roles: await this.repo.findRoleCodes(userId) };
  }

  /**
   * Xoá tài khoản: local trước (tx + cascade), Supabase sau. Idempotent — gọi lại được nếu bước sau lỗi.
   */
  async deleteMe(userId: string): Promise<void> {
    await this.repo.deleteProfile(userId);
    await this.cache.del(CACHE.perms.key(userId), CACHE.profileExists.key(userId));
    await this.cache.flag(CACHE.deleted.key(userId), CACHE.deleted.ttl);
    try {
      await this.supabaseAdmin.deleteUser(userId);
    } catch (error) {
      this.logger.error(`supabase deleteUser failed for ${userId}: ${String(error)}`);
      throw new AppException('INTERNAL');
    }
  }
}
