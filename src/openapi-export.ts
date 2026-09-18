import { ConfigService } from '@nestjs/config';
import { createApp } from './app.js';
import { OPENAPI_DOCS } from './app.module.js';
import type { Env } from './config/env.js';
import { exportOpenApi } from './config/openapi.js';

/** `npm run openapi:export` → openapi/<module>.json (không listen port). CI lưu artifact; mobile codegen. */
const app = await createApp();
await app.init();
const files = await exportOpenApi(app, OPENAPI_DOCS, app.get(ConfigService<Env, true>), 'openapi');
await app.close();
for (const f of files) console.log(`wrote ${f}`);
