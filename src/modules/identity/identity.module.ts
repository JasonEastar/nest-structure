import { Module } from '@nestjs/common';
import { AUTH_USER } from '../../common/auth/auth.guard.js';
import { IdentityAdminController } from './identity-admin.controller.js';
import { IdentityController } from './identity.controller.js';
import { IdentityRepository } from './identity.repository.js';
import { IdentityService } from './identity.service.js';

/**
 * Module identity (API cho app: /me). `AUTH_USER` là cổng để guard trong `common/` dùng service này
 * mà common không phải import modules/ (code-standards §2.2).
 */
@Module({
  controllers: [IdentityController],
  providers: [IdentityRepository, IdentityService, { provide: AUTH_USER, useExisting: IdentityService }],
  exports: [IdentityService, AUTH_USER],
})
export class IdentityModule {}

/** API quản trị tách module riêng để Swagger đưa vào /docs/admin (include lọc theo module), không lộ ở /docs/app. */
@Module({
  imports: [IdentityModule],
  controllers: [IdentityAdminController],
})
export class IdentityAdminModule {}
