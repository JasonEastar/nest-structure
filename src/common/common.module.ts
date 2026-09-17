import { Global, Module } from '@nestjs/common';
import { DRIZZLE, databaseProviders } from './database/drizzle.js';
import { QueueRootModule } from './redis/queue.js';
import { CacheService, REDIS_CACHE, redisProviders } from './redis/cache.js';
import { SUPABASE_ADMIN, SupabaseJwtService, supabaseProviders } from './auth/supabase.js';
import { AppThrottlerModule } from './redis/throttler.guard.js';

/**
 * Module @Global duy nhất: gom provider hạ tầng (DB, Redis, cache, BullMQ root, throttler; Supabase thêm ở phase 06).
 * Feature module inject `@InjectDb() db: Db`, `CacheService`, `@InjectQueue(...)` mà không cần import gì.
 */
@Global()
@Module({
  imports: [QueueRootModule, AppThrottlerModule],
  providers: [...databaseProviders, ...redisProviders, ...supabaseProviders],
  exports: [DRIZZLE, REDIS_CACHE, CacheService, SUPABASE_ADMIN, SupabaseJwtService, QueueRootModule, AppThrottlerModule],
})
export class CommonModule {}
