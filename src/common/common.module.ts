import { Global, Module } from '@nestjs/common';
import { DRIZZLE, databaseProviders } from './database/drizzle.js';
import { QueueRootModule } from './redis/queue.js';
import { CacheService } from './redis/cache.js';
import { REDIS_CACHE, redisProviders } from './redis/redis.provider.js';
import { SUPABASE_ADMIN, SupabaseJwtService, supabaseProviders } from './auth/supabase.js';
import { AppThrottlerModule } from './redis/throttler.guard.js';

/** Module @Global duy nhất: gom hạ tầng (DB, Redis, cache, BullMQ, throttler, Supabase). Module nghiệp vụ inject thẳng, không cần import. */
@Global()
@Module({
  imports: [QueueRootModule, AppThrottlerModule],
  providers: [...databaseProviders, ...redisProviders, CacheService, ...supabaseProviders],
  exports: [DRIZZLE, REDIS_CACHE, CacheService, SUPABASE_ADMIN, SupabaseJwtService, QueueRootModule, AppThrottlerModule],
})
export class CommonModule {}
