import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { SUPABASE_ADMIN, SupabaseJwtService, supabaseProviders } from './auth/supabase.js';
import { type Db, DRIZZLE, drizzleProvider } from './database/drizzle.js';
import { CacheService } from './redis/cache.js';
import { QueueRootModule } from './redis/queue.js';
import { REDIS_CACHE, redisProvider } from './redis/redis.provider.js';
import { AppThrottlerModule } from './redis/throttler.guard.js';

/** Module @Global duy nhất: gom hạ tầng (DB, Redis, cache, BullMQ, throttler, Supabase). Module nghiệp vụ inject thẳng. */
@Global()
@Module({
  imports: [QueueRootModule, AppThrottlerModule],
  providers: [drizzleProvider, redisProvider, CacheService, ...supabaseProviders],
  exports: [DRIZZLE, REDIS_CACHE, CacheService, SUPABASE_ADMIN, SupabaseJwtService, QueueRootModule, AppThrottlerModule],
})
export class CommonModule implements OnModuleDestroy {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    @Inject(REDIS_CACHE) private readonly redis: Redis,
  ) {}

  /** App tắt (SIGTERM): đóng pool Postgres và Redis. allSettled để một bên lỗi không làm bên kia bị bỏ sót. */
  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([
      this.db.$client.end({ timeout: 5 }),
      this.redis.quit().catch(() => this.redis.disconnect()),
    ]);
  }
}
