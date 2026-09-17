import { Inject, Injectable, type OnModuleDestroy, type Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import type { Env } from '../../config/env.js';
import * as schema from './schema.js';

/** Kết nối Postgres + Drizzle client có kiểu theo toàn bộ schema (barrel schema.ts). */
export type Db = PostgresJsDatabase<typeof schema>;

export const DRIZZLE = Symbol('DRIZZLE');
/** `@InjectDb() db: Db` trong repository. */
export const InjectDb = () => Inject(DRIZZLE);

/** Đóng pool khi app tắt. */
@Injectable()
export class DatabaseLifecycle implements OnModuleDestroy {
  constructor(private readonly sql: Sql) {}
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
        prepare: true, // kết nối trực tiếp, không qua pooler
        onnotice: () => {}, // tắt NOTICE trong log
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
