import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createApp } from './app.js';
import { OPENAPI_DOCS } from './app.module.js';
import type { Env } from './config/env.js';
import { setupOpenApi } from './config/openapi.js';

/** Điểm vào server: tạo app (app.ts), gắn Swagger, listen. Sentry nạp qua `node --import ./dist/instrument.js` (xem instrument.ts). */
const logger = new Logger('Bootstrap');

const app = await createApp();
const config = app.get(ConfigService<Env, true>);
setupOpenApi(app, OPENAPI_DOCS, config);
await app.listen(config.get('PORT', { infer: true }));

logger.log(`c9_map listening on :${config.get('PORT', { infer: true })} env=${config.get('NODE_ENV', { infer: true })} docs=/docs`);
