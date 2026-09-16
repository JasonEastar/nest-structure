import { existsSync } from 'node:fs';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
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

async function bootstrap(): Promise<void> {
  const env = loadEnv();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    forceCloseConnections: env.NODE_ENV === 'development',
  });

  app.enableShutdownHooks();

  await app.listen(env.PORT);

  // Phải lớn hơn keepalive_timeout của nginx (60s) để tránh ECONNRESET ngẫu nhiên.
  const server = app.getHttpServer();
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  logger.log(`c9_map listening on :${env.PORT} instance=${env.INSTANCE_ID} env=${env.NODE_ENV}`);
}

await bootstrap();
