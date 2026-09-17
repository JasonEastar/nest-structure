import './config/load-env.js'; // PHẢI đứng đầu: nạp .env trước khi app.module được import
import { Logger } from '@nestjs/common';
import { createApp } from './app.js';
import { OPENAPI_DOCS } from './app.module.js';
import { loadEnv } from './config/env.js';
import { setupOpenApi } from './config/openapi.js';

/** Điểm vào server: tạo app (app.ts), gắn Swagger, listen. */
const logger = new Logger('Bootstrap');

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', reason instanceof Error ? reason.stack : String(reason));
});
process.on('uncaughtException', (error) => {
  logger.fatal('Uncaught exception', error.stack);
  process.exit(1);
});

const env = loadEnv();
const app = await createApp();
setupOpenApi(app, OPENAPI_DOCS, env);
await app.listen(env.PORT);

// Phải lớn hơn keepalive_timeout của nginx (60 s), nếu không nginx gặp ECONNRESET ngẫu nhiên
const server = app.getHttpServer();
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

logger.log(`c9_map listening on :${env.PORT} instance=${env.INSTANCE_ID} env=${env.NODE_ENV} docs=/docs`);
