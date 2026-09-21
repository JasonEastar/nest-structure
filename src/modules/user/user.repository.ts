import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, inArray, lt, or } from 'drizzle-orm';
import { type Db, DRIZZLE } from '../../common/database/drizzle.js';
import type { SupabaseClaims } from '../../common/auth/supabase.js';
import { devices, permissions, profiles, rolePermissions, roles, userRoles } from './schema/user.schema.js';
import type { RoleCode } from './dto/role.dto.js';
import type { UpdateMe } from './dto/update-me.dto.js';
import type { AdminUserRow, UserStatus } from './dto/admin-user.dto.js';
import type { Cursor } from '../../common/http/pagination.js';

const adminUserColumns = {
  id: profiles.id,
  email: profiles.email,
  displayName: profiles.displayName,
  username: profiles.username,
  avatarUrl: profiles.avatarUrl,
  status: profiles.status,
  statusReason: profiles.statusReason,
  createdAt: profiles.createdAt,
};

/** Mọi SQL của user; service chỉ có logic. */
@Injectable()
export class UserRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  /**
   * Tạo profile + role `user` CHỈ khi profile chưa có (ON CONFLICT DO NOTHING + RETURNING: 2 instance cùng chạy vẫn một dòng;
   * profile đã có thì không gán lại `user` — admin đã đổi role hoặc tạo tài khoản với role khác). Trả status hiện tại.
   */
  async insertProfileIfMissing(claims: SupabaseClaims): Promise<{ status: UserStatus }> {
    return this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(profiles)
        .values({
          id: claims.sub,
          email: claims.email ?? null,
          displayName: claims.fullName?.trim() || claims.email?.split('@')[0] || 'Người dùng C9',
          avatarUrl: claims.avatarUrl ?? null,
        })
        .onConflictDoNothing({ target: profiles.id })
        .returning({ id: profiles.id });

      const [defaultRole] = inserted.length
        ? await tx.select({ id: roles.id }).from(roles).where(eq(roles.code, 'user')).limit(1)
        : [];
      if (defaultRole) {
        await tx
          .insert(userRoles)
          .values({ userId: claims.sub, roleId: defaultRole.id })
          .onConflictDoNothing();
      }
      const [row] = await tx.select({ status: profiles.status }).from(profiles).where(eq(profiles.id, claims.sub)).limit(1);
      return { status: (row?.status ?? 'active') as UserStatus };
    });
  }

  /** Profile theo id (= sub Supabase); null nếu chưa có. */
  async findProfile(userId: string) {
    const [row] = await this.db
      .select({
        id: profiles.id,
        email: profiles.email,
        displayName: profiles.displayName,
        username: profiles.username,
        avatarUrl: profiles.avatarUrl,
        locale: profiles.locale,
        homeCityCode: profiles.homeCityCode,
        phoneVerifiedAt: profiles.phoneVerifiedAt,
        status: profiles.status,
      })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);
    return row ?? null;
  }

  /** Cập nhật các field gửi lên. */
  async updateProfile(userId: string, patch: UpdateMe): Promise<void> {
    await this.db
      .update(profiles)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(profiles.id, userId));
  }

  /** Một dòng cho admin (kèm status, createdAt); null nếu không có. */
  async findAdminUser(userId: string): Promise<AdminUserRow | null> {
    const [row] = await this.db.select(adminUserColumns).from(profiles).where(eq(profiles.id, userId)).limit(1);
    return row ?? null;
  }

  /** Trang user cho admin, mới nhất trước; `q` tìm theo email hoặc tên (ILIKE). Lấy `limit + 1` để biết còn trang sau. */
  async findAdminUsersPage(limit: number, cursor?: Cursor, q?: string): Promise<AdminUserRow[]> {
    const afterCursor = cursor
      ? or(
          lt(profiles.createdAt, new Date(cursor.createdAt)),
          and(eq(profiles.createdAt, new Date(cursor.createdAt)), lt(profiles.id, cursor.id)),
        )
      : undefined;
    const pattern = q ? `%${q.replace(/[\\%_]/g, '\\$&')}%` : undefined; // % _ \ trong q là ký tự thường, không phải wildcard
    const search = pattern ? or(ilike(profiles.email, pattern), ilike(profiles.displayName, pattern)) : undefined;
    return this.db
      .select(adminUserColumns)
      .from(profiles)
      .where(and(afterCursor, search))
      .orderBy(desc(profiles.createdAt), desc(profiles.id))
      .limit(limit);
  }

  /** Role của nhiều user trong một query (cho danh sách). */
  async findRoleCodesByUsers(userIds: string[]): Promise<Map<string, RoleCode[]>> {
    const map = new Map<string, RoleCode[]>();
    if (!userIds.length) return map;
    const rows = await this.db
      .select({ userId: userRoles.userId, code: roles.code })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(inArray(userRoles.userId, userIds));
    for (const row of rows) map.set(row.userId, [...(map.get(row.userId) ?? []), row.code as RoleCode]);
    return map;
  }

  /** Khoá / mở khoá. */
  async updateStatus(userId: string, status: UserStatus, reason: string | null): Promise<void> {
    await this.db
      .update(profiles)
      .set({ status, statusReason: reason, updatedAt: new Date() })
      .where(eq(profiles.id, userId));
  }

  /** Mã role của user (user, moderator, ...). */
  async findRoleCodes(userId: string): Promise<RoleCode[]> {
    const rows = await this.db
      .select({ code: roles.code })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(userRoles.userId, userId));
    return rows.map((r) => r.code as RoleCode);
  }

  /** Quyền của user qua một query join. */
  async findPermissionCodes(userId: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ code: permissions.code })
      .from(userRoles)
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(userRoles.userId, userId));
    return rows.map((r) => r.code);
  }

  /** Mọi role kèm danh sách permission, gom từ join role_permissions. */
  async listRoles() {
    const rows = await this.db
      .select({ code: roles.code, name: roles.name, permission: permissions.code })
      .from(roles)
      .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
      .leftJoin(permissions, eq(permissions.id, rolePermissions.permissionId));
    const byCode = new Map<string, { code: string; name: string; permissions: string[] }>();
    for (const row of rows) {
      const entry = byCode.get(row.code) ?? { code: row.code, name: row.name, permissions: [] };
      if (row.permission) entry.permissions.push(row.permission);
      byCode.set(row.code, entry);
    }
    return [...byCode.values()];
  }

  /** Thay toàn bộ role của user trong một transaction. */
  async replaceUserRoles(userId: string, codes: RoleCode[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      const target = await tx.select({ id: roles.id }).from(roles).where(inArray(roles.code, codes));
      await tx.delete(userRoles).where(eq(userRoles.userId, userId));
      if (target.length) {
        await tx.insert(userRoles).values(target.map((r) => ({ userId, roleId: r.id }))).onConflictDoNothing();
      }
    });
  }

  /** Ghi nhận thiết bị: lần đầu insert, lần sau chỉ cập nhật last_seen_at. */
  async upsertDevice(userId: string, deviceId: string): Promise<void> {
    await this.db
      .insert(devices)
      .values({ userId, deviceId })
      .onConflictDoUpdate({
        target: [devices.userId, devices.deviceId],
        set: { lastSeenAt: new Date(), updatedAt: new Date() },
      });
  }

  /** Hard delete, cascade user_roles và devices. */
  async deleteProfile(userId: string): Promise<void> {
    await this.db.delete(profiles).where(eq(profiles.id, userId));
  }

  /** Có profile không (kiểm trước khi gán role). */
  async profileExists(userId: string): Promise<boolean> {
    const [row] = await this.db.select({ id: profiles.id }).from(profiles).where(eq(profiles.id, userId)).limit(1);
    return Boolean(row);
  }
}
