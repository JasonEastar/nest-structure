import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createApp } from './app.js';
import { OPENAPI_DOCS } from './app.module.js';
import type { Env } from './config/env.js';
import { setupOpenApi } from './config/openapi.js';

/** Điểm vào server: tạo app (app.ts), gắn Swagger, listen. Sentry nạp qua `node --import ./dist/instrument.js` (xem instrument.ts). */
const logger = new Logger('Bootstrap');

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', reason instanceof Error ? reason.stack : String(reason));
});
process.on('uncaughtException', (error) => {
  logger.fatal('Uncaught exception', error.stack);
  process.exit(1);
});

const app = await createApp();
const config = app.get(ConfigService<Env, true>);
setupOpenApi(app, OPENAPI_DOCS, config);
await app.listen(config.get('PORT', { infer: true }));

// Phải lớn hơn keepalive_timeout của nginx (60 s), nếu không nginx gặp ECONNRESET ngẫu nhiên
const server = app.getHttpServer();
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

logger.log(`c9_map listening on :${config.get('PORT', { infer: true })} instance=${config.get('INSTANCE_ID', { infer: true })} env=${config.get('NODE_ENV', { infer: true })} docs=/docs`);
