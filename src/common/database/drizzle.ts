import { Inject, Injectable, type OnModuleDestroy, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import type { Env } from '../../config/env.js';
import * as schema from './schema.js';

/**
 * Kết nối Postgres (postgres.js) + Drizzle client có kiểu theo toàn bộ schema (barrel schema.ts).
 * Kiểu cột dùng chung (timestamps, uuid v7, geography) ở columns.ts.
 */
export type Db = PostgresJsDatabase<typeof schema>;

export const DRIZZLE = Symbol('DRIZZLE');
/** `@InjectDb() db: Db` trong repository. */
export const InjectDb = () => Inject(DRIZZLE);

/** Giữ kết nối postgres.js để đóng pool khi shutdown (worker BullMQ kịp xong job trước). */
@Injectable()
export class DatabaseLifecycle implements OnModuleDestroy {
  constructor(private readonly sql: Sql) {}
  /** Đóng pool khi app tắt, đợi tối đa 5 s cho query đang chạy. */
  async onModuleDestroy(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }
}

export const POSTGRES_SQL = Symbol('POSTGRES_SQL');

export const databaseProviders: Provider[] = [
  {
    provide: POSTGRES_SQL,
    inject: [ConfigService],
    useFactory: (config: ConfigService<Env, true>): Sql =>
      postgres(config.get('DATABASE_URL', { infer: true }), {
        max: config.get('DB_POOL_MAX', { infer: true }),
        prepare: true, // kết nối trực tiếp, không pooler (ADR-0005)
        onnotice: () => {}, // tắt NOTICE của Postgres trong log
      }),
  },
  {
    provide: DRIZZLE,
    inject: [POSTGRES_SQL],
    useFactory: (sql: Sql): Db => drizzle(sql, { schema, casing: 'snake_case' }),
  },
  {
    provide: DatabaseLifecycle,
    inject: [POSTGRES_SQL],
    useFactory: (sql: Sql) => new DatabaseLifecycle(sql),
  },
];
