import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from '@nestjs/common';
import { ConditionalModule, ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullBoardQueuesModule, bullBoardRootOptions, createBullBoardAuth } from './common/redis/bull-board.js';
import { CommonModule } from './common/common.module.js';
import { AUTH_USER, AuthGuard, type AuthUserPort } from './common/auth/auth.guard.js';
import { AllExceptionsFilter } from './common/http/exceptions.js';
import { PermissionGuard } from './common/auth/permission.guard.js';
import { AppI18nModule } from './config/i18n.js';
import { PinoLoggerModule } from './config/logger.js';
import { RequestContextMiddleware } from './common/http/request-context.middleware.js';
import { ResponseInterceptor } from './common/http/response.js';
import { SupabaseJwtService } from './common/auth/supabase.js';
import { AppThrottlerGuard } from './common/redis/throttler.guard.js';
import { ValidationPipeProvider } from './common/http/validation.js';
import { envSchema } from './config/env.js';
import { HealthModule } from './modules/health/health.module.js';
import { IdentityAdminModule, IdentityModule } from './modules/identity/identity.module.js';
import { PinModule } from './modules/pin/pin.module.js';

/** Route nằm ngoài prefix /api: health (Docker HEALTHCHECK), docs, Bull Board. main.ts và test dùng chung. */
export const GLOBAL_PREFIX_EXCLUDE = [
  { path: 'health/{*splat}', method: RequestMethod.GET },
  { path: 'docs/{*splat}', method: RequestMethod.GET },
  { path: 'admin/queues', method: RequestMethod.ALL },
  { path: 'admin/queues/{*splat}', method: RequestMethod.ALL },
];

/** Tài liệu OpenAPI (include tường minh — rỗng = Swagger lấy tất cả, không được phép). */
export const OPENAPI_DOCS = { app: [HealthModule, IdentityModule, PinModule], admin: [IdentityAdminModule] };

/** Bull Board: bảo vệ bằng JWT + permission queue:read qua `middleware` chính thức của @bull-board/nestjs; tắt khi test. */
const boardEnabled = (env: NodeJS.ProcessEnv) => env.NODE_ENV !== 'test';
const BullBoardRootModule = BullBoardModule.forRootAsync({
  imports: [IdentityModule],
  inject: [SupabaseJwtService, AUTH_USER],
  useFactory: (jwt: SupabaseJwtService, users: AuthUserPort) => bullBoardRootOptions(createBullBoardAuth(jwt, users)),
});

@Module({
  imports: [
    // ignoreEnvFile: .env đã được nạp một lần trong main.ts/test setup (process.loadEnvFile).
    // Nếu để ConfigModule tự đọc .env, giá trị trong FILE sẽ ghi đè biến môi trường thật (compose/CI) — hai nguồn sự thật.
    ConfigModule.forRoot({ isGlobal: true, cache: true, ignoreEnvFile: true, validationSchema: envSchema }),
    PinoLoggerModule,
    AppI18nModule,
    CommonModule,
    HealthModule,
    IdentityModule,
    IdentityAdminModule,
    PinModule,
    ConditionalModule.registerWhen(BullBoardRootModule, boardEnabled),
    ConditionalModule.registerWhen(BullBoardQueuesModule, boardEnabled),
  ],
  providers: [
    // Thứ tự APP_GUARD = thứ tự chạy: Throttler (chặn sớm, chưa tốn CPU verify) → Auth → Permission
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
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
