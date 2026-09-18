import { VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule, GLOBAL_PREFIX_EXCLUDE } from './app.module.js';
import type { Env } from './config/env.js';

/** Tạo app đã cấu hình HTTP (chưa listen). Dùng chung cho main.ts và openapi-export.ts. */
export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true, // cho verify chữ ký webhook thanh toán sau này
    bufferLogs: true, // giữ log lúc boot cho tới khi pino sẵn sàng
    // Chỉ dev: tắt nhanh khi Ctrl+C. Prod phải để request đang chạy hoàn tất (option này destroy cả socket đang phục vụ).
    forceCloseConnections: process.env.NODE_ENV === 'development',
  });
  app.useLogger(app.get(PinoLogger));

  const config = app.get(ConfigService<Env, true>);
  app.use(helmet());
  app.set('trust proxy', config.get('TRUST_PROXY_HOPS', { infer: true })); // để req.ip là IP thật sau nginx
  app.setGlobalPrefix('api', { exclude: GLOBAL_PREFIX_EXCLUDE });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' }); // /api/v1/...
  app.enableShutdownHooks(); // SIGTERM → đóng DB/Redis gọn

  return app;
}
