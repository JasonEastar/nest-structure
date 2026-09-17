import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { Public } from '../../common/auth/decorators.js';
import type { Env } from '../../config/env.js';
import { DrizzleHealthIndicator, RedisHealthIndicator } from './health.indicators.js';

/**
 * Health endpoints nằm ngoài prefix /api (main.ts `exclude`) và ngoài versioning (VERSION_NEUTRAL) → /health/live.
 * - /health/live : process còn sống, không check dependency (liveness).
 * - /health/ready: DB + Redis; 503 khi một dependency down. Terminus tự trả 503 `shutting_down` sau SIGTERM
 *   (beforeApplicationShutdown có sẵn) → nginx/compose ngừng route trong lúc job/request đang chạy được hoàn tất.
 */
@ApiTags('Health')
@Public()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly health: HealthCheckService,
    private readonly dbIndicator: DrizzleHealthIndicator,
    private readonly redisIndicator: RedisHealthIndicator,
  ) {}

  @Get('live')
  @ApiOperation({ summary: 'Process còn sống', description: 'Không kiểm dependency. Docker HEALTHCHECK và nginx dùng endpoint này.' })
  @ApiOkResponse({ description: '{ data: { status: "ok", instance } }' })
  live(): { data: { status: 'ok'; instance: string } } {
    return {
      data: { status: 'ok', instance: this.config.get('INSTANCE_ID', { infer: true }) },
    };
  }

  @Get('ready')
  @HealthCheck()
  @ApiOperation({
    summary: 'Sẵn sàng nhận request',
    description: 'Ping Postgres và Redis. 503 khi một dependency down hoặc app đang shutdown (grace 5 s) → LB ngừng route tới instance này.',
  })
  ready() {
    return this.health.check([
      () => this.dbIndicator.isHealthy('db'),
      () => this.redisIndicator.isHealthy('redis'),
    ]);
  }
}
