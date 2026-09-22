import { Injectable } from '@nestjs/common';
import { AppException } from '../../../common/http/exceptions.js';
import type { Permission, PermissionGroup, UpsertPermission, UpsertPermissionGroup } from '../dto/permission.dto.js';
import { PermissionRepository, toGroup } from '../repositories/permission.repository.js';

/**
 * Permission + nhóm (tab admin UI), admin CRUD cả hai theo id, sửa được cả code; permission luôn thuộc một nhóm.
 * Mã phải trùng chuỗi trong `@RequirePermission` của route; đổi/xoá mã đang dùng là trách nhiệm của admin (route đó sẽ không ai vào được).
 */
@Injectable()
export class PermissionService {
  constructor(private readonly repo: PermissionRepository) {}

  /** Mọi nhóm (tab) kèm permission của nhóm. */
  listGrouped(): Promise<PermissionGroup[]> {
    return this.repo.listGrouped();
  }

  async createGroup(input: UpsertPermissionGroup): Promise<Omit<PermissionGroup, 'permissions'>> {
    if (await this.repo.groupCodeExists(input.code)) throw new AppException('CONFLICT', { field: 'code' });
    return toGroup(await this.repo.insertGroup(input));
  }

  async updateGroup(id: string, input: UpsertPermissionGroup): Promise<Omit<PermissionGroup, 'permissions'>> {
    if (await this.repo.groupCodeExists(input.code, id)) throw new AppException('CONFLICT', { field: 'code' });
    const row = await this.repo.updateGroup(id, input);
    if (!row) throw new AppException('NOT_FOUND', { id });
    return toGroup(row);
  }

  /** Nhóm còn permission → CONFLICT (count) (chuyển permission sang nhóm khác trước). */
  async removeGroup(id: string): Promise<void> {
    const inUse = await this.repo.countPermissionsInGroup(id);
    if (inUse > 0) throw new AppException('CONFLICT', { count: inUse });
    if (!(await this.repo.deleteGroup(id))) throw new AppException('NOT_FOUND', { id });
  }

  // ---- permission ---------------------------------------------------------------------------------------------------------

  /** Trùng mã → CONFLICT (field code); groupId lạ → NOT_FOUND. */
  async createPermission(input: UpsertPermission): Promise<Permission> {
    if (await this.repo.permissionCodeExists(input.code)) throw new AppException('CONFLICT', { field: 'code' });
    await this.assertGroupExists(input.groupId);
    return this.repo.insertPermission(input);
  }

  /** Thay toàn bộ (code, mô tả, nhóm). */
  async updatePermission(id: string, input: UpsertPermission): Promise<Permission> {
    await this.requirePermission(id);
    if (await this.repo.permissionCodeExists(input.code, id)) throw new AppException('CONFLICT', { field: 'code' });
    await this.assertGroupExists(input.groupId);
    return (await this.repo.updatePermission(id, input))!;
  }

  /** Đang gán cho role → CONFLICT (count) (gỡ khỏi role trước). */
  async removePermission(id: string): Promise<void> {
    await this.requirePermission(id);
    const roles = await this.repo.countRolesWithPermission(id);
    if (roles > 0) throw new AppException('CONFLICT', { count: roles });
    await this.repo.deletePermission(id);
  }

  private async requirePermission(id: string): Promise<Permission> {
    const row = await this.repo.findPermissionById(id);
    if (!row) throw new AppException('NOT_FOUND', { id });
    return row;
  }

  private async assertGroupExists(groupId: string | undefined): Promise<void> {
    if (groupId && !(await this.repo.findGroupById(groupId))) {
      throw new AppException('NOT_FOUND', { id: groupId });
    }
  }
}
