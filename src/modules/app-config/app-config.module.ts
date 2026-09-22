import { Module } from '@nestjs/common';
import { AppConfigAdminController, AppConfigPublicController } from './app-config.controller.js';
import { AppConfigRepository } from './app-config.repository.js';
import { AppConfigService } from './app-config.service.js';

/** Config động trong DB (bảng app_configs): client đọc bản public, admin CRUD. Tên `app-config` để không nhầm với `src/config/` (env, logger...). */
@Module({
  controllers: [AppConfigPublicController, AppConfigAdminController],
  providers: [AppConfigRepository, AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
