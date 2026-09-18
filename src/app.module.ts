import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, DiscoveryModule } from '@nestjs/core';
import { CommonModule } from './common/common.module.js';
import { AuthGuard } from './common/auth/auth.guard.js';
import { AllExceptionsFilter } from './common/http/exceptions.js';
import { PermissionGuard } from './common/auth/permission.guard.js';
import { AppI18nModule } from './config/i18n.js';
import { PinoLoggerModule } from './config/logger.js';
import { RequestContextMiddleware } from './common/http/request-context.middleware.js';
import { ResponseInterceptor } from './common/http/response.js';
import { AppThrottlerGuard } from './common/redis/throttler.guard.js';
import { ValidationPipeProvider } from './common/http/validation.js';
import { envSchema } from './config/env.js';
import type { OpenApiDefinition } from './config/openapi.js';
import { HealthModule } from './modules/health/health.module.js';
import { UserModule } from './modules/user/user.module.js';
import { LocationModule } from './modules/location/location.module.js';
import { QueueBoardModule } from './modules/queue-board/queue-board.module.js';

/** Route nằm ngoài prefix /api: health (Docker HEALTHCHECK), Swagger UI, Bull Board. app.ts và test dùng chung. */
export const GLOBAL_PREFIX_EXCLUDE = [
  { path: 'health/{*splat}', method: RequestMethod.GET },
  { path: 'docs/{*splat}', method: RequestMethod.GET },
  { path: 'admin/queues', method: RequestMethod.ALL },
  { path: 'admin/queues/{*splat}', method: RequestMethod.ALL },
];

/** Swagger: mỗi mục = một định nghĩa trong dropdown (/docs/<key>-json, openapi/<key>.json). Module mới → thêm mục. */
export const OPENAPI_DOCS: OpenApiDefinition[] = [
  {
    key: 'health',
    title: 'Health',
    description: 'Liveness/readiness cho Docker, nginx, load balancer. Không cần đăng nhập, nằm ngoài prefix /api.',
    tags: [{ name: 'Health', description: 'Trạng thái process và dependency (Postgres, Redis)' }],
    modules: [HealthModule],
  },
  {
    key: 'users',
    title: 'User & Auth',
    description: 'Đăng nhập Google qua Supabase, hồ sơ /me, role và permission. Backend không phát token, chỉ xác minh JWT.',
    tags: [
      { name: 'Me', description: 'Hồ sơ của user đang đăng nhập' },
      { name: 'Roles', description: 'Quản trị role/permission (cần quyền)' },
    ],
    modules: [UserModule],
  },
  {
    key: 'locations',
    title: 'Locations',
    description: 'Địa điểm user tự lưu (tên, toạ độ, bán kính) và truy vấn địa điểm công khai quanh một toạ độ (PostGIS).',
    tags: [{ name: 'Locations', description: 'Địa điểm đã lưu, công khai hoặc riêng tư' }],
    modules: [LocationModule],
  },
];

/** Module gốc. providers APP_* chạy cho MỌI request: middleware → guard → pipe → handler → interceptor → filter. */
@Module({
  imports: [
    // Đọc .env (biến đã có trong môi trường thắng file) rồi validate bằng envSchema; ConfigService dùng ở mọi nơi
    ConfigModule.forRoot({ isGlobal: true, cache: true, validationSchema: envSchema }),
    PinoLoggerModule,
    AppI18nModule,
    DiscoveryModule, // DiscoveryService cho config/openapi.ts (ghi quyền vào Swagger)
    CommonModule,
    HealthModule,
    UserModule,
    LocationModule,
    QueueBoardModule,
  ],
  providers: [
    // Thứ tự guard = thứ tự chạy: Throttler → Auth → Permission
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    ValidationPipeProvider,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule implements NestModule {
  /** Middleware chạy trước mọi guard: gắn X-Request-Id / X-Instance-Id cho mọi route. */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('{*splat}');
  }
}
