import { Injectable } from '@nestjs/common';
import { HealthIndicatorService, type HealthIndicatorResult } from '@nestjs/terminus';
import { sql } from 'drizzle-orm';
import type { Redis } from 'ioredis';
import { type Db, InjectDb } from '../../common/database/drizzle.js';
import { InjectRedisCache } from '../../common/redis/cache.js';

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

@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly indicators: HealthIndicatorService,
    @InjectRedisCache() private readonly redis: Redis,
  ) {}

  async isHealthy(key = 'redis'): Promise<HealthIndicatorResult> {
    const indicator = this.indicators.check(key);
    try {
      const pong = await this.redis.ping();
      return pong === 'PONG' ? indicator.up() : indicator.down({ message: `unexpected reply ${pong}` });
    } catch (error) {
      return indicator.down({ message: error instanceof Error ? error.message : String(error) });
    }
  }
}
