import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SentryModule } from '@sentry/nestjs/setup';
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
import { AppConfigModule } from './modules/app-config/app-config.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { UserModule } from './modules/user/user.module.js';
import { LocationModule } from './modules/location/location.module.js';

/** Route nằm ngoài prefix /api: health (Docker HEALTHCHECK, load balancer), Swagger UI. app.ts và test dùng chung. */
export const GLOBAL_PREFIX_EXCLUDE = [
  { path: 'health/{*splat}', method: RequestMethod.GET },
  { path: 'docs/{*splat}', method: RequestMethod.GET },
];

/** Swagger: mỗi mục = một định nghĩa trong dropdown (/docs/<key>-json, openapi/<key>.json). Module mới → thêm mục. */
export const OPENAPI_DOCS: OpenApiDefinition[] = [
  {
    key: 'system',
    title: 'Configs & Health',
    tags: [
      { name: 'Health', description: 'Trạng thái process và dependency (Postgres, Redis). Không cần đăng nhập' },
      { name: 'Configs', description: '/public/configs (không cần đăng nhập) · /admin/configs (cần permission config:*)' },
    ],
    modules: [HealthModule, AppConfigModule],
  },
  {
    key: 'users',
    title: 'User & Auth',
    tags: [
      { name: 'Me', description: 'Hồ sơ của user đang đăng nhập' },
      { name: 'Users', description: 'Admin tạo tài khoản, xem danh sách, khoá user (cần quyền)' },
      { name: 'Roles', description: 'Quản trị role, gán role cho user (cần quyền)' },
      { name: 'Permissions', description: 'Permission theo nhóm (tab) và CRUD nhóm (cần quyền)' },
    ],
    modules: [UserModule],
  },
  {
    key: 'locations',
    title: 'Locations',
    tags: [{ name: 'Locations' }],
    modules: [LocationModule],
  },
];

/** Module gốc. providers APP_* chạy cho MỌI request: middleware → guard → pipe → handler → interceptor → filter. */
@Module({
  imports: [
    // Đọc .env (biến đã có trong môi trường thắng file) rồi validate bằng envSchema; ConfigService dùng ở mọi nơi
    ConfigModule.forRoot({ isGlobal: true, cache: true, validationSchema: envSchema }),
    SentryModule.forRoot(), // gắn request context vào lỗi/trace; no-op khi không có SENTRY_DSN
    PinoLoggerModule,
    AppI18nModule,
    DiscoveryModule, // DiscoveryService cho config/openapi.ts (ghi quyền vào Swagger)
    CommonModule,
    HealthModule,
    UserModule,
    LocationModule,
    AppConfigModule,
  ],
  providers: [
    // Thứ tự guard = thứ tự chạy: Throttler → Auth → Permission (chặn flood trước khi tốn CPU verify JWT)
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    ValidationPipeProvider,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule implements NestModule {
  /** Middleware chạy trước mọi guard: gắn X-Request-Id cho mọi route. */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('{*splat}');
  }
}
