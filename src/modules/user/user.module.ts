import { Module } from '@nestjs/common';
import { AUTH_USER } from '../../common/auth/auth.guard.js';
import { RoleAdminController, UserAdminController, UserController } from './user.controller.js';
import { UserRepository } from './user.repository.js';
import { UserService } from './user.service.js';

/**
 * Module user: /me, /admin/users, /admin/roles. `AUTH_USER` là cổng để guard trong `common/` dùng service này
 * mà common không phải import modules/ (code-standards §2.2).
 */
@Module({
  controllers: [UserController, UserAdminController, RoleAdminController],
  providers: [UserRepository, UserService, { provide: AUTH_USER, useExisting: UserService }],
  exports: [UserService, AUTH_USER],
})
export class UserModule {}
