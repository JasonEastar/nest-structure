import { Module } from '@nestjs/common';
import { AppConfigController } from './app-config.controller.js';
import { AppConfigService } from './app-config.service.js';

/** Config công khai cho client (enum + nhãn). Tên `app-config` để không nhầm với `src/config/` (env, logger...). */
@Module({
  controllers: [AppConfigController],
  providers: [AppConfigService],
})
export class AppConfigModule {}
