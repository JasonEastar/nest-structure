import { Module } from '@nestjs/common';
import { LocationController, LocationPublicController } from './location.controller.js';
import { LocationRepository } from './location.repository.js';
import { LocationService } from './location.service.js';

/** Module mẫu, copy cấu trúc này cho module mới (docs/code-walkthrough.md §6). Không cần import DB/Redis (CommonModule @Global). */
@Module({
  controllers: [LocationController, LocationPublicController],
  providers: [LocationRepository, LocationService],
  exports: [LocationService], // module khác (post…) gọi qua service, không inject repository
})
export class LocationModule {}
