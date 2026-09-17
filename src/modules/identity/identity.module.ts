import { Module } from '@nestjs/common';
import { AUTH_USER } from '../../common/auth/auth.guard.js';
import { IdentityAdminController, IdentityController } from './identity.controller.js';
import { IdentityRepository } from './identity.repository.js';
import { IdentityService } from './identity.service.js';

/**
 * Module identity: /me và /admin/roles. `AUTH_USER` là cổng để guard trong `common/` dùng service này
 * mà common không phải import modules/ (code-standards §2.2).
 */
@Module({
  controllers: [IdentityController, IdentityAdminController],
  providers: [IdentityRepository, IdentityService, { provide: AUTH_USER, useExisting: IdentityService }],
  exports: [IdentityService, AUTH_USER],
})
export class IdentityModule {}
