import { hostname } from 'node:os';
import { Controller, Get, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { Public } from '../../common/auth/decorators.js';
import { DrizzleHealthIndicator, RedisHealthIndicator } from './health.indicators.js';

/**
 * /health/live (process sống) · /health/ready (DB + Redis, 503 khi down hoặc đang shutdown).
 * Dành cho Docker/load balancer, KHÔNG theo shape { success, code, msg, data, meta } của API app
 * (ResponseInterceptor bỏ qua /health) — probe đọc `status`, và /ready giữ nguyên shape của Terminus.
 */
const LiveResponseSchema = z.object({ status: z.literal('ok'), instance: z.string() }).meta({ id: 'LiveResponse' });
type Live = z.infer<typeof LiveResponseSchema>;

@ApiTags('Health')
@Public()
@Controller({ path: 'health', version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly dbIndicator: DrizzleHealthIndicator,
    private readonly redisIndicator: RedisHealthIndicator,
  ) {}

  @Get('live')
  @ApiOkResponse({ standardSchema: LiveResponseSchema })
  live(): Live {
    return { status: 'ok', instance: hostname() };
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
