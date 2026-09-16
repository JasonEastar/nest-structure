import { Controller, Get, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';

/**
 * Health endpoints nằm ngoài prefix /api (phase 04 thêm `exclude`).
 * - /health/live : process còn sống (không check dependency).
 * - /health/ready: DB + Redis (phase 03/05, dùng @nestjs/terminus).
 */
@Controller('health')
export class HealthController {
  constructor(private readonly config: ConfigService<Env, true>) {}

  @Get('live')
  live(): { data: { status: 'ok'; instance: string } } {
    return {
      data: { status: 'ok', instance: this.config.get('INSTANCE_ID', { infer: true }) },
    };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
