import { Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { type Db, InjectDb } from '../../common/database.js';
import type { SupabaseClaims } from '../../common/supabase.js';
import { devices, permissions, profiles, rolePermissions, roles, userRoles } from './identity.schema.js';
import type { RoleCode } from './identity.dto.js';

/** Mọi SQL của identity nằm ở đây; service chỉ có logic (code-standards §5). */
@Injectable()
export class IdentityRepository {
  constructor(@InjectDb() private readonly db: Db) {}

  /**
   * Tạo profile + role `user` cho `sub` mới. Idempotent: hai instance nhận request đầu cùng lúc
   * vẫn chỉ một dòng (ON CONFLICT DO NOTHING trong một transaction).
   */
  async insertProfileIfMissing(claims: SupabaseClaims): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .insert(profiles)
        .values({
          id: claims.sub,
          email: claims.email ?? null,
          displayName: claims.fullName?.trim() || claims.email?.split('@')[0] || 'Người dùng C9',
          avatarUrl: claims.avatarUrl ?? null,
        })
        .onConflictDoNothing({ target: profiles.id });

      const [defaultRole] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.code, 'user')).limit(1);
      if (defaultRole) {
        await tx
          .insert(userRoles)
          .values({ userId: claims.sub, roleId: defaultRole.id })
          .onConflictDoNothing();
      }
    });
  }

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
      })
      .from(profiles)
      .where(eq(profiles.id, userId))
      .limit(1);
    return row ?? null;
  }

  async findRoleCodes(userId: string): Promise<RoleCode[]> {
    const rows = await this.db
      .select({ code: roles.code })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(userRoles.userId, userId));
    return rows.map((r) => r.code as RoleCode);
  }

  /** Một query (không N+1): user → roles → permissions. */
  async findPermissionCodes(userId: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ code: permissions.code })
      .from(userRoles)
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(userRoles.userId, userId));
    return rows.map((r) => r.code);
  }

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

  async upsertDevice(userId: string, deviceId: string): Promise<void> {
    await this.db
      .insert(devices)
      .values({ userId, deviceId })
      .onConflictDoUpdate({
        target: [devices.userId, devices.deviceId],
        set: { lastSeenAt: new Date(), updatedAt: new Date() },
      });
  }

  /** Hard delete (cascade user_roles, devices). `profiles.deleted_at` dành cho ẩn danh hoá pin/thread ở gđ sau, chưa dùng. */
  async deleteProfile(userId: string): Promise<void> {
    await this.db.delete(profiles).where(eq(profiles.id, userId));
  }

  async profileExists(userId: string): Promise<boolean> {
    const [row] = await this.db.select({ id: profiles.id }).from(profiles).where(eq(profiles.id, userId)).limit(1);
    return Boolean(row);
  }
}
