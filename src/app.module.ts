import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { CommonModule } from './common/common.module.js';
import { AllExceptionsFilter } from './common/exceptions.js';
import { AppI18nModule } from './common/i18n.js';
import { PinoLoggerModule } from './common/logger.js';
import { RequestContextMiddleware } from './common/request-context.middleware.js';
import { ResponseInterceptor } from './common/response.js';
import { ValidationPipeProvider } from './common/validation.js';
import { envSchema } from './config/env.js';
import { HealthModule } from './health/health.controller.js';

/**
 * Tài liệu OpenAPI (include tường minh — rỗng = Swagger lấy tất cả, không được phép).
 * Phase 06: app = [IdentityModule, PinModule…], admin = [IdentityAdminModule…]. Tạm dùng HealthModule để build được.
 */
export const OPENAPI_DOCS = { app: [HealthModule], admin: [HealthModule] };

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validationSchema: envSchema }),
    PinoLoggerModule,
    AppI18nModule,
    CommonModule,
    HealthModule,
  ],
  providers: [
    // Thứ tự APP_GUARD (phase 05–06): Throttler → Auth → Permission
    ValidationPipeProvider,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('{*splat}');
  }
}
