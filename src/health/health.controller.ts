import { Controller, Get, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthCheck, HealthCheckService, TerminusModule } from '@nestjs/terminus';
import type { Env } from '../config/env.js';
import { DrizzleHealthIndicator } from './health.indicators.js';

/**
 * Health endpoints nằm ngoài prefix /api (phase 04 thêm `exclude`).
 * - /health/live : process còn sống, không check dependency (liveness).
 * - /health/ready: DB (+ Redis ở phase 05); 503 khi một dependency down (readiness).
 */
@Controller('health')
export class HealthController {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly health: HealthCheckService,
    private readonly dbIndicator: DrizzleHealthIndicator,
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
    return this.health.check([() => this.dbIndicator.isHealthy('db')]);
  }
}

@Module({
  imports: [TerminusModule.forRoot({ logger: false })],
  controllers: [HealthController],
  providers: [DrizzleHealthIndicator],
})
export class HealthModule {}
