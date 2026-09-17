import { Module } from '@nestjs/common';
import { LocationPublicController } from './location-public.controller.js';
import { LocationController } from './location.controller.js';
import { LocationRepository } from './location.repository.js';
import { LocationService } from './location.service.js';

/**
 * Module mẫu (reference) — copy cấu trúc này cho mọi module nghiệp vụ:
 *   location.module.ts · location.controller.ts · location-public.controller.ts (route không cần đăng nhập)
 *   location.service.ts · location.repository.ts · location.constants.ts
 *   dto/<use-case>.dto.ts · schema/location.schema.ts · test/unit/location.service.spec.ts · test/integration/location.spec.ts
 * DB/Redis/Supabase không cần import: CommonModule là @Global. Chỉ export service khi module khác cần gọi.
 */
@Module({
  controllers: [LocationController, LocationPublicController],
  providers: [LocationRepository, LocationService],
})
export class LocationModule {}
