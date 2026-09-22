import { Inject, Injectable } from '@nestjs/common';
import { count, eq, inArray } from 'drizzle-orm';
import { type Db, DRIZZLE } from '../../../common/database/drizzle.js';
import type { Role, RoleCode } from '../dto/role.dto.js';
import { permissions, rolePermissions, roles, userRoles } from '../schema/user.schema.js';
import { SYSTEM_ROLE } from '../user.constants.js';

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
    return rows.map((r) => r.code);
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
    for (const row of rows) map.set(row.userId, [...(map.get(row.userId) ?? []), row.code]);
    return map;
  }

  /** Quyền hiệu lực của user. Role `admin` = MỌI permission trong bảng (kể cả admin vừa tạo), không phụ thuộc role_permissions. */
  async findPermissionCodes(userId: string): Promise<string[]> {
    const rows = await this.db
      .selectDistinct({ role: roles.code, permission: permissions.code })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .leftJoin(rolePermissions, eq(rolePermissions.roleId, userRoles.roleId))
      .leftJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(userRoles.userId, userId));
    if (rows.some((r) => r.role === SYSTEM_ROLE.admin)) return (await this.db.select({ code: permissions.code }).from(permissions)).map((r) => r.code);
    return [...new Set(rows.map((r) => r.permission).filter((p): p is string => p !== null))];
  }

  /** Mọi role kèm permission, gom từ join role_permissions. */
  async listRoles(): Promise<Role[]> {
    const rows = await this.db
      .select({
        id: roles.id,
        code: roles.code,
        name: roles.name,
        description: roles.description,
        isSystem: roles.isSystem,
        permission: permissions.code,
      })
      .from(roles)
      .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
      .leftJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .orderBy(roles.createdAt);
    const byId = new Map<string, Role>();
    for (const row of rows) {
      const entry = byId.get(row.id) ?? { id: row.id, code: row.code, name: row.name, description: row.description, isSystem: row.isSystem, permissions: [] };
      if (row.permission) entry.permissions.push(row.permission);
      byId.set(row.id, entry);
    }
    return [...byId.values()];
  }

  async findRoleById(id: string): Promise<Role | null> {
    return (await this.listRoles()).find((r) => r.id === id) ?? null;
  }

  /** id theo mã; mã không có sẽ thiếu trong Map (service báo lỗi). */
  async findRoleIdsByCodes(codes: RoleCode[]): Promise<Map<RoleCode, string>> {
    const rows = await this.db.select({ id: roles.id, code: roles.code }).from(roles).where(inArray(roles.code, codes));
    return new Map(rows.map((r) => [r.code, r.id]));
  }

  async codeExists(code: RoleCode): Promise<boolean> {
    const [row] = await this.db.select({ id: roles.id }).from(roles).where(eq(roles.code, code)).limit(1);
    return Boolean(row);
  }

  /** Tạo role + gán permission (theo id, service đã tra mã) trong một transaction; trả id. */
  async insertRole(input: { code: string; name: string; description: string | null }, permissionIds: string[]): Promise<string> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx.insert(roles).values(input).returning({ id: roles.id });
      await this.replacePermissionsTx(tx, row!.id, permissionIds);
      return row!.id;
    });
  }

  /** Sửa tên/mô tả + thay toàn bộ permission. */
  async updateRole(id: string, input: { name: string; description: string | null }, permissionIds: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.update(roles).set({ ...input, updatedAt: new Date() }).where(eq(roles.id, id));
      await this.replacePermissionsTx(tx, id, permissionIds);
    });
  }

  async deleteRole(id: string): Promise<void> {
    await this.db.delete(roles).where(eq(roles.id, id)); // role_permissions cascade; user_roles đã kiểm rỗng ở service
  }

  async countUsersWithRole(roleId: string): Promise<number> {
    const [row] = await this.db.select({ n: count() }).from(userRoles).where(eq(userRoles.roleId, roleId));
    return Number(row?.n ?? 0);
  }

  /** User đang mang role (để xoá cache quyền khi role đổi permission). */
  async findUserIdsByRole(roleId: string): Promise<string[]> {
    const rows = await this.db.select({ userId: userRoles.userId }).from(userRoles).where(eq(userRoles.roleId, roleId));
    return rows.map((r) => r.userId);
  }

  /** Thay toàn bộ role của user trong một transaction (roleIds đã được service kiểm tồn tại). */
  async replaceUserRoles(userId: string, roleIds: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.delete(userRoles).where(eq(userRoles.userId, userId));
      if (roleIds.length) {
        await tx.insert(userRoles).values(roleIds.map((roleId) => ({ userId, roleId }))).onConflictDoNothing();
      }
    });
  }

  private async replacePermissionsTx(tx: Parameters<Parameters<Db['transaction']>[0]>[0], roleId: string, permissionIds: string[]): Promise<void> {
    await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
    if (permissionIds.length) await tx.insert(rolePermissions).values(permissionIds.map((permissionId) => ({ roleId, permissionId })));
  }
}
