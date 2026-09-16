import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUES } from '../../common/queue.js';
import { PinJobs, PinScheduler } from './pin.jobs.js';

/** Module pin — phase skeleton chỉ có queue + scheduler; controller/service/repository thêm ở bước 7 (pin core). */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUES.MARKER_MAINTENANCE })],
  providers: [PinScheduler, PinJobs],
  exports: [BullModule],
})
export class PinModule {}
