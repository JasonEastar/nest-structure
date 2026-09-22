import { Inject, Injectable } from '@nestjs/common';
import { asc, count, eq, inArray } from 'drizzle-orm';
import { type Db, DRIZZLE } from '../../../common/database/drizzle.js';
import type { Permission, PermissionGroup, UpsertPermission, UpsertPermissionGroup } from '../dto/permission.dto.js';
import { permissionGroups, permissions, rolePermissions } from '../schema/user.schema.js';

const permissionColumns = { id: permissions.id, code: permissions.code, description: permissions.description, groupId: permissions.groupId };

type GroupRow = typeof permissionGroups.$inferSelect;

/** SQL của permission_groups và permissions (admin CRUD; role_permissions ở role.repository). */
@Injectable()
export class PermissionRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  /** Nhóm theo sort rồi tên, mỗi nhóm kèm permission của nó. */
  async listGrouped(): Promise<PermissionGroup[]> {
    const [groupRows, permRows] = await Promise.all([
      this.db.select().from(permissionGroups).orderBy(asc(permissionGroups.sort), asc(permissionGroups.name)),
      this.db.select(permissionColumns).from(permissions).orderBy(asc(permissions.code)),
    ]);
    const groups: PermissionGroup[] = groupRows.map((g) => ({ ...toGroup(g), permissions: [] }));
    const byId = new Map(groups.map((g) => [g.id, g]));
    for (const p of permRows) byId.get(p.groupId)?.permissions.push(p);
    return groups;
  }

  async countPermissionsInGroup(groupId: string): Promise<number> {
    const [row] = await this.db.select({ n: count() }).from(permissions).where(eq(permissions.groupId, groupId));
    return Number(row?.n ?? 0);
  }

  async findGroupById(id: string): Promise<GroupRow | null> {
    const [row] = await this.db.select().from(permissionGroups).where(eq(permissionGroups.id, id)).limit(1);
    return row ?? null;
  }

  async groupCodeExists(code: string, exceptId?: string): Promise<boolean> {
    const rows = await this.db.select({ id: permissionGroups.id }).from(permissionGroups).where(eq(permissionGroups.code, code)).limit(1);
    return rows.some((r) => r.id !== exceptId);
  }

  async insertGroup(input: UpsertPermissionGroup): Promise<GroupRow> {
    const [row] = await this.db.insert(permissionGroups).values(input).returning();
    return row!;
  }

  async updateGroup(id: string, input: UpsertPermissionGroup): Promise<GroupRow | null> {
    const [row] = await this.db.update(permissionGroups).set({ ...input, updatedAt: new Date() }).where(eq(permissionGroups.id, id)).returning();
    return row ?? null;
  }

  /** Xoá nhóm (service đã kiểm nhóm rỗng). */
  async deleteGroup(id: string): Promise<boolean> {
    const rows = await this.db.delete(permissionGroups).where(eq(permissionGroups.id, id)).returning({ id: permissionGroups.id });
    return rows.length > 0;
  }

  // ---- permissions ----------------------------------------------------------------------------------------------------

  async findPermissionById(id: string): Promise<Permission | null> {
    const [row] = await this.db.select(permissionColumns).from(permissions).where(eq(permissions.id, id)).limit(1);
    return row ?? null;
  }

  async permissionCodeExists(code: string, exceptId?: string): Promise<boolean> {
    const rows = await this.db.select({ id: permissions.id }).from(permissions).where(eq(permissions.code, code)).limit(1);
    return rows.some((r) => r.id !== exceptId);
  }

  /** id theo mã; mã không có sẽ thiếu trong Map (service báo 422). */
  async findPermissionIdsByCodes(codes: string[]): Promise<Map<string, string>> {
    if (!codes.length) return new Map();
    const rows = await this.db.select({ id: permissions.id, code: permissions.code }).from(permissions).where(inArray(permissions.code, codes));
    return new Map(rows.map((r) => [r.code, r.id]));
  }

  async insertPermission(input: UpsertPermission): Promise<Permission> {
    const [row] = await this.db.insert(permissions).values({ ...input, description: input.description ?? null }).returning(permissionColumns);
    return row!;
  }

  async updatePermission(id: string, input: UpsertPermission): Promise<Permission | null> {
    const [row] = await this.db
      .update(permissions)
      .set({ ...input, description: input.description ?? null, updatedAt: new Date() })
      .where(eq(permissions.id, id))
      .returning(permissionColumns);
    return row ?? null;
  }

  /** Số role đang được gán permission này (xoá phải gỡ khỏi role trước). */
  async countRolesWithPermission(id: string): Promise<number> {
    const [row] = await this.db.select({ n: count() }).from(rolePermissions).where(eq(rolePermissions.permissionId, id));
    return Number(row?.n ?? 0);
  }

  async deletePermission(id: string): Promise<boolean> {
    const rows = await this.db.delete(permissions).where(eq(permissions.id, id)).returning({ id: permissions.id });
    return rows.length > 0;
  }
}

export function toGroup(row: GroupRow): Omit<PermissionGroup, 'permissions'> {
  return { id: row.id, code: row.code, name: row.name, description: row.description, sort: row.sort };
}
