import { Module } from '@nestjs/common';
import { AUTH_USER } from '../../common/auth/auth.guard.js';
import { UserAdminController, UserController } from './controllers/user.controller.js';
import { PermissionController } from './controllers/permission.controller.js';
import { RoleController } from './controllers/role.controller.js';
import { UserRepository } from './repositories/user.repository.js';
import { PermissionRepository } from './repositories/permission.repository.js';
import { RoleRepository } from './repositories/role.repository.js';
import { UserService } from './services/user.service.js';
import { PermissionService } from './services/permission.service.js';
import { RoleService } from './services/role.service.js';

/**
 * Module user — 3 nghiệp vụ (user: /me + /admin/users · role: /admin/roles · permission: /admin/permissions, nhóm) nên xếp theo tầng: controllers/ services/ repositories/;
 * dto/, schema/, constants dùng chung ở gốc. `AUTH_USER` là cổng để guard trong `common/` dùng UserService.
 */
@Module({
  controllers: [UserController, UserAdminController, RoleController, PermissionController],
  providers: [
    UserRepository,
    RoleRepository,
    PermissionRepository,
    UserService,
    RoleService,
    PermissionService,
    { provide: AUTH_USER, useExisting: UserService },
  ],
  exports: [UserService, AUTH_USER],
})
export class UserModule {}
