import { Module } from '@nestjs/common';
import { AUTH_USER } from '../../common/auth/auth.guard.js';
import { UserAdminController, UserController } from './controllers/user.controller.js';
import { RoleController } from './controllers/role.controller.js';
import { UserRepository } from './repositories/user.repository.js';
import { RoleRepository } from './repositories/role.repository.js';
import { UserService } from './services/user.service.js';
import { RoleService } from './services/role.service.js';

/**
 * Module user — 2 nghiệp vụ (profile: /me + /admin/users · role: /admin/roles) nên xếp theo tầng: controllers/ services/ repositories/;
 * dto/, schema/, constants dùng chung ở gốc. `AUTH_USER` là cổng để guard trong `common/` dùng UserService.
 */
@Module({
  controllers: [UserController, UserAdminController, RoleController],
  providers: [UserRepository, RoleRepository, UserService, RoleService, { provide: AUTH_USER, useExisting: UserService }],
  exports: [UserService, AUTH_USER],
})
export class UserModule {}
