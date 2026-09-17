import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller.js';
import { DrizzleHealthIndicator, RedisHealthIndicator } from './health.indicators.js';

@Module({
  // gracefulShutdownTimeoutMs: sau SIGTERM, ready trả 503 và đợi bấy nhiêu ms cho LB rút instance rồi mới đóng app
  imports: [TerminusModule.forRoot({ logger: false, gracefulShutdownTimeoutMs: 5_000 })],
  controllers: [HealthController],
  providers: [DrizzleHealthIndicator, RedisHealthIndicator],
})
export class HealthModule {}
