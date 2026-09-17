import { Module } from '@nestjs/common';
import { LocationController } from './location.controller.js';
import { LocationRepository } from './location.repository.js';
import { LocationService } from './location.service.js';

/**
 * Module mẫu (reference) — copy cấu trúc này cho mọi module nghiệp vụ:
 *   location.module.ts · location.controller.ts · location.service.ts · location.repository.ts · location.constants.ts
 *   dto/<use-case>.dto.ts · schema/location.schema.ts · test/unit/location.service.spec.ts · test/integration/location.spec.ts
 * DB/Redis/Supabase không cần import: CommonModule là @Global. Chỉ export service khi module khác cần gọi.
 */
@Module({
  controllers: [LocationController],
  providers: [LocationRepository, LocationService],
})
export class LocationModule {}
