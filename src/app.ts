import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule, GLOBAL_PREFIX_EXCLUDE } from './app.module.js';
import { loadEnv } from './config/env.js';

/**
 * Tạo app Nest đã cấu hình HTTP (chưa listen). Dùng chung cho main.ts (chạy server) và openapi-export.ts (chỉ xuất JSON).
 * Thứ tự: env → NestFactory → logger pino → helmet → trust proxy → prefix /api → version v1 → shutdown hooks.
 */
export async function createApp(): Promise<NestExpressApplication> {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true, // giữ body thô để verify chữ ký webhook thanh toán (giai đoạn 3)
    bufferLogs: true, // giữ log lúc boot cho tới khi pino sẵn sàng
    forceCloseConnections: env.NODE_ENV === 'development',
  });
  app.useLogger(app.get(PinoLogger));

  app.use(helmet());
  app.set('trust proxy', env.TRUST_PROXY_HOPS); // số proxy phía trước (nginx = 1) để req.ip là IP thật của client
  app.setGlobalPrefix('api', { exclude: GLOBAL_PREFIX_EXCLUDE }); // /api/... ; health, docs, admin/queues ở ngoài
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' }); // /api/v1/...
  app.enableShutdownHooks(); // SIGTERM → đóng DB/Redis/worker gọn (Docker stop, deploy)

  return app;
}
