import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
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
import { PinModule } from './modules/pin/pin.module.js';
import { QueueBoardModule } from './modules/queue-board/queue-board.module.js';

/** Route nằm ngoài prefix /api: health (Docker HEALTHCHECK), Swagger UI, Bull Board. app.ts và test dùng chung. */
export const GLOBAL_PREFIX_EXCLUDE = [
  { path: 'health/{*splat}', method: RequestMethod.GET },
  { path: 'docs/{*splat}', method: RequestMethod.GET },
  { path: 'admin/queues', method: RequestMethod.ALL },
  { path: 'admin/queues/{*splat}', method: RequestMethod.ALL },
];

/**
 * Tài liệu OpenAPI chia theo module nghiệp vụ: mỗi mục = một định nghĩa trong dropdown "Select a definition"
 * (/docs/<key>, JSON /docs/<key>-json, file openapi/<key>.json). Module mới → thêm một mục ở đây (hoặc gộp vào mục có sẵn).
 * Ghi chú "Quyền cần có" / "Không cần đăng nhập" tự sinh từ @RequirePermissions / @Public, không viết tay.
 */
export const OPENAPI_DOCS: OpenApiDefinition[] = [
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
  {
    key: 'health',
    title: 'Health',
    description: 'Liveness/readiness cho Docker, nginx, load balancer. Không cần đăng nhập, nằm ngoài prefix /api.',
    tags: [{ name: 'Health', description: 'Trạng thái process và dependency (Postgres, Redis)' }],
    modules: [HealthModule],
  },
];

/**
 * Module gốc: nối mọi thứ lại.
 * - imports: cấu hình (env, log, i18n) → hạ tầng (CommonModule @Global) → module nghiệp vụ.
 * - providers APP_*: các "lớp bọc" chạy cho MỌI request theo thứ tự middleware → guard → pipe → handler → interceptor → filter.
 */
@Module({
  imports: [
    // ignoreEnvFile: .env đã được nạp một lần ở config/load-env.ts. Để ConfigModule tự đọc .env thì giá trị trong file
    // sẽ ghi đè biến môi trường thật của compose/CI — hai nguồn sự thật.
    ConfigModule.forRoot({ isGlobal: true, cache: true, ignoreEnvFile: true, validationSchema: envSchema }),
    PinoLoggerModule,
    AppI18nModule,
    CommonModule,
    HealthModule,
    UserModule,
    LocationModule,
    PinModule,
    QueueBoardModule,
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
  /** Middleware chạy trước mọi guard: gắn X-Request-Id / X-Instance-Id cho mọi route. */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('{*splat}');
  }
}
