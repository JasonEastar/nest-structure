import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AuthUser, AuthUserPort } from '../../../common/auth/auth.guard.js';
import { AppException } from '../../../common/http/exceptions.js';
import { hasPermission, type Permission } from '../../../common/auth/permissions.js';
import { CACHE, CacheService } from '../../../common/redis/cache.js';
import { SUPABASE_ADMIN, type SupabaseAdminPort, type SupabaseClaims } from '../../../common/auth/supabase.js';
import { decodeCursor, pageOf } from '../../../common/http/pagination.js';
import {
  type AdminUser,
  type CreateUser,
  type ListUsersQuery,
  type SetUserStatus,
  type UserStatus,
  toAdminUser,
} from '../dto/admin-user.dto.js';
import { type MeResponse, toMeResponse } from '../dto/me.dto.js';
import type { UpdateMe } from '../dto/update-me.dto.js';
import { RoleRepository } from '../repositories/role.repository.js';
import { UserRepository } from '../repositories/user.repository.js';

/**
 * Nghiệp vụ user — một domain, hai mặt: (1) cổng AUTH_USER cho guard + /me của chính mình, (2) /admin/users (cùng dữ liệu,
 * chỉ khác quyền gọi). Role: role.service.ts.
 */
@Injectable()
export class UserService implements AuthUserPort {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly repo: UserRepository,
    private readonly roles: RoleRepository,
    private readonly cache: CacheService,
    @Inject(SUPABASE_ADMIN) private readonly supabaseAdmin: SupabaseAdminPort,
  ) {}

  // ---- Cổng cho AuthGuard (AuthUserPort) --------------------------------------------------------------------------------

  /** Tạo profile lần đầu (thay trigger DB vì Supabase là DB khác); `{ status }` cache 1 giờ để không chạm DB mỗi request. */
  async ensureProfile(claims: SupabaseClaims): Promise<AuthUser> {
    // Token còn hạn sau DELETE /me không được làm profile sống lại
    if (await this.cache.has(CACHE.deleted.key(claims.sub))) throw new AppException('UNAUTHENTICATED');
    const key = CACHE.profile.key(claims.sub);
    let profile = await this.cache.getJson<{ status: UserStatus }>(key);
    if (!profile) {
      profile = await this.repo.insertProfileIfMissing(claims);
      await this.cache.setJson(key, profile, CACHE.profile.ttl);
    }
    if (profile.status === 'blocked') throw new AppException('FORBIDDEN', { reason: 'ACCOUNT_BLOCKED' });
    return { id: claims.sub, email: claims.email ?? null };
  }

  /** Quyền hiệu lực, cache 5 phút; đổi role → xoá cache ngay. */
  async getPermissions(userId: string): Promise<string[]> {
    const key = CACHE.perms.key(userId);
    const cached = await this.cache.getJson<string[]>(key);
    if (cached) return cached;
    const codes = await this.roles.findPermissionCodes(userId);
    await this.cache.setJson(key, codes, CACHE.perms.ttl);
    return codes;
  }

  // ---- /me ----------------------------------------------------------------------------------------------------------------

  /** Hồ sơ /me: profile + role + permission hiệu lực. */
  async getMe(userId: string): Promise<MeResponse> {
    const profile = await this.repo.findProfile(userId);
    if (!profile) throw new AppException('NOT_FOUND', { resource: 'profile' });
    const [roles, permissions] = await Promise.all([
      this.roles.findRoleCodes(userId),
      this.getPermissions(userId),
    ]);
    return toMeResponse(profile, roles, permissions);
  }

  /** Sửa hồ sơ (không gồm username — định danh, đặt một lần). */
  async updateMe(userId: string, patch: UpdateMe): Promise<MeResponse> {
    await this.repo.updateProfile(userId, patch);
    return this.getMe(userId);
  }

  /** Xoá tài khoản: local trước (cascade), Supabase sau; gọi lại được nếu bước sau lỗi. */
  async deleteMe(userId: string): Promise<void> {
    await this.repo.deleteProfile(userId);
    await this.cache.del(CACHE.perms.key(userId), CACHE.profile.key(userId));
    await this.cache.flag(CACHE.deleted.key(userId), CACHE.deleted.ttl);
    try {
      await this.supabaseAdmin.deleteUser(userId);
    } catch (error) {
      this.logger.error(`supabase deleteUser failed for ${userId}: ${String(error)}`);
      throw new AppException('INTERNAL');
    }
  }

  // ---- /admin/users --------------------------------------------------------------------------------------------

  /**
   * Tạo tài khoản email + mật khẩu (Supabase giữ mật khẩu). Supabase trước vì là nguồn `sub`; Postgres lỗi → xoá lại
   * bên Supabase để không mồ côi. Gán role ≠ `user` cần thêm `role:assign` (chặn leo thang quyền).
   */
  async createUser(actorId: string, input: CreateUser): Promise<AdminUser> {
    const elevated = input.roles.some((r) => r !== 'user');
    if (elevated) await this.requirePermission(actorId, 'role:assign');
    const displayName = input.displayName ?? input.email.split('@')[0];
    const { id } = await this.supabaseAdmin.createUser({ email: input.email, password: input.password, displayName });
    try {
      await this.repo.insertProfileIfMissing({ sub: id, email: input.email, fullName: displayName, isAnonymous: false });
      if (elevated) await this.roles.replaceUserRoles(id, input.roles);
    } catch (error) {
      await this.supabaseAdmin
        .deleteUser(id)
        .catch((e: unknown) => this.logger.error(`rollback supabase user ${id} failed: ${String(e)}`));
      throw error;
    }
    return this.getUser(id);
  }

  /** Danh sách user cho admin (cursor, tìm theo email/tên). */
  async listUsers(query: ListUsersQuery) {
    const rows = await this.repo.findAdminUsersPage(query.limit + 1, decodeCursor(query.cursor), query.q);
    const page = pageOf(rows, query.limit, (r) => ({ createdAt: r.createdAt.toISOString(), id: r.id }));
    const rolesByUser = await this.roles.findRoleCodesByUsers(page.data.map((r) => r.id));
    return { data: page.data.map((r) => toAdminUser(r, rolesByUser.get(r.id) ?? [])), meta: page.meta };
  }

  /** Một user cho admin. */
  async getUser(userId: string): Promise<AdminUser> {
    const row = await this.repo.findAdminUser(userId);
    if (!row) throw new AppException('NOT_FOUND', { resource: 'user', id: userId });
    return toAdminUser(row, await this.roles.findRoleCodes(userId));
  }

  /**
   * Khoá / mở khoá. Không tự khoá mình; khoá người có role `admin` cần thêm `role:assign`.
   * Ghi đè cache `{ status }` nên guard trên mọi instance chặn ngay, không đợi TTL.
   */
  async setUserStatus(actorId: string, userId: string, input: SetUserStatus): Promise<AdminUser> {
    if (actorId === userId) throw new AppException('FORBIDDEN', { reason: 'CANNOT_BLOCK_SELF' });
    const row = await this.repo.findAdminUser(userId);
    if (!row) throw new AppException('NOT_FOUND', { resource: 'user', id: userId });
    const roles = await this.roles.findRoleCodes(userId);
    if (roles.includes('admin')) await this.requirePermission(actorId, 'role:assign');
    const reason = input.status === 'blocked' ? (input.reason ?? null) : null;
    await this.repo.updateStatus(userId, input.status, reason);
    await this.cache.setJson(CACHE.profile.key(userId), { status: input.status }, CACHE.profile.ttl);
    return toAdminUser({ ...row, status: input.status, statusReason: reason }, roles);
  }

  /** Luật phụ thuộc dữ liệu (guard không kiểm được): thiếu quyền → 403 kèm `missing`. */
  private async requirePermission(actorId: string, permission: Permission): Promise<void> {
    if (!hasPermission(await this.getPermissions(actorId), permission)) {
      throw new AppException('FORBIDDEN', { missing: [permission] });
    }
  }

}
