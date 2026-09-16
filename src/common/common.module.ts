import { Global, Module } from '@nestjs/common';
import { DRIZZLE, databaseProviders } from './database.js';

/**
 * Module @Global duy nhất: gom provider hạ tầng (DB; Redis/Queue/Supabase thêm ở phase 05–06).
 * Feature module inject `@InjectDb() db: Db` mà không cần import gì.
 */
@Global()
@Module({
  providers: [...databaseProviders],
  exports: [DRIZZLE],
})
export class CommonModule {}
