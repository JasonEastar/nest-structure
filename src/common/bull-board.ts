import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { BullBoardModule } from '@bull-board/nestjs';
import { QUEUES } from './queue.js';

/**
 * Bull Board tại /admin/queues (xem queue depth, job lỗi, retry).
 * Phase 05: chỉ import khi NODE_ENV=development (app.module.ts). Phase 06: bảo vệ bằng @RequirePermissions('queue:read').
 * Route nằm ngoài prefix /api (main.ts exclude) và ngoài ResponseInterceptor (response.ts SKIP_PREFIXES).
 */
export const BULL_BOARD_ROUTE = '/admin/queues';

export const BullBoardRootModule = BullBoardModule.forRoot({
  route: BULL_BOARD_ROUTE,
  adapter: ExpressAdapter,
  boardOptions: { uiConfig: { boardTitle: 'C9 Map queues' } },
});

export const BullBoardQueuesModule = BullBoardModule.forFeature(
  ...Object.values(QUEUES).map((name) => ({ name, adapter: BullMQAdapter })),
);
