import { Injectable } from '@nestjs/common';
import { HealthIndicatorService, type HealthIndicatorResult } from '@nestjs/terminus';
import { sql } from 'drizzle-orm';
import { type Db, InjectDb } from '../common/database.js';

/** Terminus 12: inject HealthIndicatorService, trả indicator.up()/down() (API cũ HealthIndicator đã bị gỡ). */
@Injectable()
export class DrizzleHealthIndicator {
  constructor(
    private readonly indicators: HealthIndicatorService,
    @InjectDb() private readonly db: Db,
  ) {}

  async isHealthy(key = 'db'): Promise<HealthIndicatorResult> {
    const indicator = this.indicators.check(key);
    try {
      await this.db.execute(sql`select 1`);
      return indicator.up();
    } catch (error) {
      return indicator.down({ message: error instanceof Error ? error.message : String(error) });
    }
  }
}
