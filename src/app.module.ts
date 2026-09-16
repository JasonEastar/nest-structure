import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConditionalModule, ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { BullBoardQueuesModule, BullBoardRootModule } from './common/bull-board.js';
import { CommonModule } from './common/common.module.js';
import { AllExceptionsFilter } from './common/exceptions.js';
import { AppI18nModule } from './common/i18n.js';
import { PinoLoggerModule } from './common/logger.js';
import { RequestContextMiddleware } from './common/request-context.middleware.js';
import { ResponseInterceptor } from './common/response.js';
import { AppThrottlerGuard } from './common/throttler.guard.js';
import { ValidationPipeProvider } from './common/validation.js';
import { envSchema } from './config/env.js';
import { HealthModule } from './health/health.controller.js';
import { PinModule } from './modules/pin/pin.module.js';

/**
 * Tài liệu OpenAPI (include tường minh — rỗng = Swagger lấy tất cả, không được phép).
 * Phase 06: app = [IdentityModule, PinModule…], admin = [IdentityAdminModule…]. Tạm dùng HealthModule để build được.
 */
export const OPENAPI_DOCS = { app: [HealthModule, PinModule], admin: [HealthModule] };

/** Bull Board chỉ ngoài production cho tới khi có bảo vệ bằng JWT + permission (phase 06). ConditionalModule đọc env đúng cách. */
const notProd = (env: NodeJS.ProcessEnv) => env.NODE_ENV !== 'production';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validationSchema: envSchema }),
    PinoLoggerModule,
    AppI18nModule,
    CommonModule,
    HealthModule,
    PinModule,
    ConditionalModule.registerWhen(BullBoardRootModule, notProd),
    ConditionalModule.registerWhen(BullBoardQueuesModule, notProd),
  ],
  providers: [
    // Thứ tự APP_GUARD = thứ tự chạy: Throttler → Auth → Permission (phase 06)
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
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
