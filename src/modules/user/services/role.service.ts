import { Injectable } from '@nestjs/common';
import { AppException } from '../../../common/http/exceptions.js';
import { CacheService } from '../../../common/redis/cache.js';
import type { RoleCode, UserRoles } from '../dto/role.dto.js';
import { RoleRepository } from '../repositories/role.repository.js';
import { UserRepository } from '../repositories/user.repository.js';
import { USER_CACHE } from '../user.constants.js';

/** Quản trị role: xem role/permission, gán role cho user. Quyền hiệu lực của user do UserService đọc (cache) — ở đây chỉ xoá cache khi đổi. */
@Injectable()
export class RoleService {
  constructor(
    private readonly roles: RoleRepository,
    private readonly users: UserRepository,
    private readonly cache: CacheService,
  ) {}

  /** Danh sách role kèm permission. */
  listRoles() {
    return this.roles.listRoles();
  }

  /** Role hiện tại của một user; user không có → NOT_FOUND (cùng luật với setUserRoles). */
  async listUserRoles(userId: string): Promise<RoleCode[]> {
    await this.assertProfileExists(userId);
    return this.roles.findRoleCodes(userId);
  }

  /** Thay toàn bộ role; xoá cache quyền để hiệu lực ngay trên mọi instance. */
  async setUserRoles(userId: string, codes: RoleCode[]): Promise<UserRoles> {
    await this.assertProfileExists(userId);
    await this.roles.replaceUserRoles(userId, codes);
    await this.cache.del(USER_CACHE.perms.key(userId));
    return { id: userId, roles: await this.roles.findRoleCodes(userId) };
  }

  private async assertProfileExists(userId: string): Promise<void> {
    if (!(await this.users.profileExists(userId))) {
      throw new AppException('NOT_FOUND', { resource: 'profile', id: userId });
    }
  }
}
