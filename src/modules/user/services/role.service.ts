import { Injectable } from '@nestjs/common';
import { AppException, validationError } from '../../../common/http/exceptions.js';
import { CacheService } from '../../../common/redis/cache.js';
import type { CreateRole, Role, RoleCode, UpdateRole, UserRoles } from '../dto/role.dto.js';
import { PermissionRepository } from '../repositories/permission.repository.js';
import { RoleRepository } from '../repositories/role.repository.js';
import { UserRepository } from '../repositories/user.repository.js';
import { USER_CACHE } from '../user.constants.js';

/**
 * Quản trị role (dữ liệu trong DB): CRUD role, gán permission cho role, gán role cho user. Nhóm permission: permission.service.ts.
 * Đổi role/permission → xoá cache quyền của user liên quan để hiệu lực ngay trên mọi instance.
 */
@Injectable()
export class RoleService {
  constructor(
    private readonly roles: RoleRepository,
    private readonly permissions: PermissionRepository,
    private readonly users: UserRepository,
    private readonly cache: CacheService,
  ) {}

  // ---- Role -------------------------------------------------------------------------------------------------------------

  listRoles(): Promise<Role[]> {
    return this.roles.listRoles();
  }

  /** Trùng code → CONFLICT (field code). */
  async createRole(input: CreateRole): Promise<Role> {
    if (await this.roles.codeExists(input.code)) throw new AppException('CONFLICT', { field: 'code' });
    const permissionIds = await this.resolvePermissionIds(input.permissions);
    const id = await this.roles.insertRole({ code: input.code, name: input.name, description: input.description ?? null }, permissionIds);
    return (await this.roles.findRoleById(id))!;
  }

  /** Sửa tên/mô tả/permission (code giữ nguyên). Permission đổi → xoá cache quyền của mọi user mang role. */
  async updateRole(id: string, input: UpdateRole): Promise<Role> {
    const role = await this.requireRole(id);
    const permissionIds = await this.resolvePermissionIds(input.permissions);
    await this.roles.updateRole(id, { name: input.name, description: input.description ?? null }, permissionIds);
    if ([...input.permissions].sort().join() !== [...role.permissions].sort().join()) await this.invalidateUsersOfRole(id);
    return (await this.roles.findRoleById(id))!;
  }

  /** Không xoá role hệ thống; role đang gán cho user → CONFLICT (count) (gỡ khỏi user trước). */
  async removeRole(id: string): Promise<void> {
    const role = await this.requireRole(id);
    if (role.isSystem) throw new AppException('FORBIDDEN', { code: role.code });
    const inUse = await this.roles.countUsersWithRole(id);
    if (inUse > 0) throw new AppException('CONFLICT', { count: inUse });
    await this.roles.deleteRole(id);
  }

  // ---- Role của user ------------------------------------------------------------------------------------------------------

  /** Role hiện tại của một user; user không có → NOT_FOUND (cùng luật với setUserRoles). */
  async listUserRoles(userId: string): Promise<RoleCode[]> {
    await this.assertProfileExists(userId);
    return this.roles.findRoleCodes(userId);
  }

  /** Thay toàn bộ role; mã không tồn tại → 422 (kiểm trước, như zod); xoá cache quyền để hiệu lực ngay trên mọi instance. */
  async setUserRoles(userId: string, codes: RoleCode[]): Promise<UserRoles> {
    const roleIds = await this.resolveRoleIds(codes);
    await this.assertProfileExists(userId);
    await this.roles.replaceUserRoles(userId, roleIds);
    await this.cache.del(USER_CACHE.perms.key(userId));
    return { id: userId, roles: await this.roles.findRoleCodes(userId) };
  }

  /** Mã role → id; mã lạ → VALIDATION_FAILED liệt kê từng mã (dùng trước khi tạo user để không tạo dở). */
  async resolveRoleIds(codes: RoleCode[]): Promise<string[]> {
    const ids = await this.roles.findRoleIdsByCodes(codes);
    const missing = codes.filter((c) => !ids.has(c));
    if (missing.length) {
      throw validationError(missing.map((code) => ({ path: 'roles', message: 'validation.role_not_found', args: { code } })));
    }
    return [...ids.values()];
  }

  /** Mã permission → id; mã lạ → VALIDATION_FAILED liệt kê từng mã. */
  private async resolvePermissionIds(codes: string[]): Promise<string[]> {
    const ids = await this.permissions.findPermissionIdsByCodes(codes);
    const missing = codes.filter((c) => !ids.has(c));
    if (missing.length) {
      throw validationError(missing.map((code) => ({ path: 'permissions', message: 'validation.permission_not_found', args: { code } })));
    }
    return [...ids.values()];
  }

  private async requireRole(id: string): Promise<Role> {
    const role = await this.roles.findRoleById(id);
    if (!role) throw new AppException('NOT_FOUND', { id });
    return role;
  }

  private async assertProfileExists(userId: string): Promise<void> {
    if (!(await this.users.profileExists(userId))) {
      throw new AppException('NOT_FOUND', { id: userId });
    }
  }

  private async invalidateUsersOfRole(roleId: string): Promise<void> {
    const userIds = await this.roles.findUserIdsByRole(roleId);
    for (let i = 0; i < userIds.length; i += 500) {
      await this.cache.del(...userIds.slice(i, i + 500).map((id) => USER_CACHE.perms.key(id)));
    }
  }
}
