import { Inject, Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { type Db, DRIZZLE } from '../../../common/database/drizzle.js';
import type { RoleCode } from '../dto/role.dto.js';
import { permissions, rolePermissions, roles, userRoles } from '../schema/user.schema.js';

/** SQL của roles · role_permissions · user_roles. (Gán role `user` lần đầu nằm trong UserRepository.insertProfileIfMissing — cùng transaction tạo profile.) */
@Injectable()
export class RoleRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  /** Mã role của user (user, moderator, ...). */
  async findRoleCodes(userId: string): Promise<RoleCode[]> {
    const rows = await this.db
      .select({ code: roles.code })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(eq(userRoles.userId, userId));
    return rows.map((r) => r.code as RoleCode);
  }

  /** Role của nhiều user trong một query (cho danh sách admin). */
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

  /** Quyền hiệu lực của user qua một query join. */
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
}
