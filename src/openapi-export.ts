import './config/load-env.js'; // PHẢI đứng đầu (xem main.ts)
import { createApp } from './app.js';
import { OPENAPI_DOCS } from './app.module.js';
import { exportOpenApi } from './config/openapi.js';

/** `npm run openapi:export` → openapi/app.json + openapi/admin.json (không listen port). CI lưu artifact; mobile codegen. */
const app = await createApp();
await app.init();
const files = await exportOpenApi(app, OPENAPI_DOCS, 'openapi');
await app.close();
for (const f of files) console.log(`wrote ${f}`);
