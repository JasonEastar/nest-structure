import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { type Db, DRIZZLE } from '../../common/database/drizzle.js';
import type { UpsertConfig } from './dto/config.dto.js';
import { type AppConfigRow, appConfigs } from './schema/app-config.schema.js';

/** SQL bảng app_configs. */
@Injectable()
export class AppConfigRepository {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  /** Theo tên (nếu có), chỉ public khi `publicOnly`; sắp theo tên để client nhận thứ tự ổn định. */
  async findMany(names: string[], publicOnly: boolean): Promise<AppConfigRow[]> {
    return this.db
      .select()
      .from(appConfigs)
      .where(and(publicOnly ? eq(appConfigs.isPublic, true) : undefined, names.length ? inArray(appConfigs.name, names) : undefined))
      .orderBy(asc(appConfigs.name));
  }

  async findById(id: string): Promise<AppConfigRow | null> {
    const [row] = await this.db.select().from(appConfigs).where(eq(appConfigs.id, id)).limit(1);
    return row ?? null;
  }

  async nameExists(name: string, exceptId?: string): Promise<boolean> {
    const rows = await this.db.select({ id: appConfigs.id }).from(appConfigs).where(eq(appConfigs.name, name)).limit(1);
    return rows.some((r) => r.id !== exceptId);
  }

  async insert(input: UpsertConfig): Promise<AppConfigRow> {
    const [row] = await this.db.insert(appConfigs).values(input).returning();
    return row!;
  }

  async update(id: string, input: UpsertConfig): Promise<AppConfigRow | null> {
    const [row] = await this.db.update(appConfigs).set(input).where(eq(appConfigs.id, id)).returning();
    return row ?? null;
  }

  async deleteById(id: string): Promise<boolean> {
    const rows = await this.db.delete(appConfigs).where(eq(appConfigs.id, id)).returning({ id: appConfigs.id });
    return rows.length > 0;
  }
}
