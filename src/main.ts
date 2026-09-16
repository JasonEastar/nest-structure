import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Logger, RequestMethod, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule, OPENAPI_DOCS } from './app.module.js';
import { setupOpenApi } from './common/openapi.js';
import { loadEnv } from './config/env.js';

// Nạp .env TRƯỚC loadEnv(): ConfigModule chỉ đọc .env khi Nest resolve AppModule (sau bước này).
// Node ≥ 20.12 có sẵn loadEnvFile, không cần dotenv. Biến đã có trong process.env không bị ghi đè.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const logger = new Logger('Bootstrap');

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', reason instanceof Error ? reason.stack : String(reason));
});
process.on('uncaughtException', (error) => {
  logger.fatal('Uncaught exception', error.stack);
  process.exit(1);
});

/** Route nằm ngoài prefix /api: health probe (Docker HEALTHCHECK), docs. */
export const GLOBAL_PREFIX_EXCLUDE = [
  { path: 'health/{*splat}', method: RequestMethod.GET },
  { path: 'docs/{*splat}', method: RequestMethod.GET },
];

export async function createApp(): Promise<NestExpressApplication> {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true, // webhook thanh toán ký HMAC (gđ 3)
    bufferLogs: true,
    forceCloseConnections: env.NODE_ENV === 'development',
  });
  app.useLogger(app.get(PinoLogger));

  app.use(helmet());
  app.set('trust proxy', env.TRUST_PROXY_HOPS); // số proxy phía trước (nginx = 1, ALB + nginx = 2) để req.ip là IP thật
  app.setGlobalPrefix('api', { exclude: GLOBAL_PREFIX_EXCLUDE });
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.enableShutdownHooks();

  return app;
}

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await createApp();
  setupOpenApi(app, OPENAPI_DOCS);

  await app.listen(env.PORT);

  // Phải lớn hơn keepalive_timeout của nginx (60s) để tránh ECONNRESET ngẫu nhiên.
  const server = app.getHttpServer();
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  logger.log(`c9_map listening on :${env.PORT} instance=${env.INSTANCE_ID} env=${env.NODE_ENV} docs=/docs/app`);
}

// Entry riêng (openapi-export.ts) import createApp; chỉ bootstrap khi file này là entry.
// `nest start` chạy `node dist/main` (không đuôi) → so sánh đường dẫn đã bỏ .js.
const stripJs = (p: string) => resolve(p).replace(/\.js$/, '');
if (process.argv[1] && stripJs(process.argv[1]) === stripJs(fileURLToPath(import.meta.url))) {
  await bootstrap();
}
