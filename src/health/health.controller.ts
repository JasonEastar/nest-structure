import { Controller, Get, Module, VERSION_NEUTRAL } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthCheck, HealthCheckService, TerminusModule } from '@nestjs/terminus';
import type { Env } from '../config/env.js';
import { DrizzleHealthIndicator, RedisHealthIndicator } from './health.indicators.js';

/**
 * Health endpoints nằm ngoài prefix /api (main.ts `exclude`) và ngoài versioning (VERSION_NEUTRAL) → /health/live.
 * - /health/live : process còn sống, không check dependency (liveness).
 * - /health/ready: DB + Redis; 503 khi một dependency down. Terminus tự trả 503 `shutting_down` sau SIGTERM
 *   (beforeApplicationShutdown có sẵn) → nginx/compose ngừng route trong lúc job/request đang chạy được hoàn tất.
 */
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly health: HealthCheckService,
    private readonly dbIndicator: DrizzleHealthIndicator,
    private readonly redisIndicator: RedisHealthIndicator,
  ) {}

  @Get('live')
  live(): { data: { status: 'ok'; instance: string } } {
    return {
      data: { status: 'ok', instance: this.config.get('INSTANCE_ID', { infer: true }) },
    };
  }

  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([
      () => this.dbIndicator.isHealthy('db'),
      () => this.redisIndicator.isHealthy('redis'),
    ]);
  }
}

@Module({
  // gracefulShutdownTimeoutMs: sau SIGTERM, ready trả 503 và đợi bấy nhiêu ms cho LB rút instance rồi mới đóng app
  imports: [TerminusModule.forRoot({ logger: false, gracefulShutdownTimeoutMs: 5_000 })],
  controllers: [HealthController],
  providers: [DrizzleHealthIndicator, RedisHealthIndicator],
})
export class HealthModule {}
