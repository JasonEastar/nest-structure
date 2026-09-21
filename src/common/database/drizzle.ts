import type { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import type { Env } from '../../config/env.js';
import * as schema from './schema.js';

/** Drizzle client có kiểu theo toàn bộ schema. Inject: `@Inject(DRIZZLE) private readonly db: Db`.
 * `db.$client` là kết nối postgres.js bên dưới, CommonModule dùng để đóng pool khi app tắt. */
export type Db = PostgresJsDatabase<typeof schema> & { $client: Sql };
export const DRIZZLE = Symbol('DRIZZLE');

export const drizzleProvider: Provider = {
  provide: DRIZZLE,
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>): Db => {
    const sql = postgres(config.get('DATABASE_URL', { infer: true }), {
      max: 10,
      prepare: true, // kết nối trực tiếp, không qua pooler
      onnotice: () => {}, // tắt NOTICE trong log
    });
    return drizzle(sql, { schema, casing: 'snake_case' });
  },
};
