import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule, GLOBAL_PREFIX_EXCLUDE } from './app.module.js';
import { loadEnv } from './config/env.js';

/** Tạo app đã cấu hình HTTP (chưa listen). Dùng chung cho main.ts và openapi-export.ts. */
export async function createApp(): Promise<NestExpressApplication> {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true, // cho verify chữ ký webhook thanh toán sau này
    bufferLogs: true, // giữ log lúc boot cho tới khi pino sẵn sàng
    forceCloseConnections: env.NODE_ENV === 'development',
  });
  app.useLogger(app.get(PinoLogger));

  app.use(helmet());
  app.set('trust proxy', env.TRUST_PROXY_HOPS); // để req.ip là IP thật sau nginx
  app.setGlobalPrefix('api', { exclude: GLOBAL_PREFIX_EXCLUDE });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' }); // /api/v1/...
  app.enableShutdownHooks(); // SIGTERM → đóng DB/Redis gọn

  return app;
}
