import './config/load-env.js'; // MUST đứng đầu: ConfigModule snapshot process.env lúc import app.module (xem main.ts)
import { OPENAPI_DOCS } from './app.module.js';
import { exportOpenApi } from './common/openapi.js';
import { createApp } from './main.js';

/**
 * `npm run openapi:export` → openapi/app.json + openapi/admin.json (không listen port).
 * CI lưu làm artifact; mobile (Flutter/RN) codegen từ đây.
 */
const app = await createApp();
await app.init();
const files = await exportOpenApi(app, OPENAPI_DOCS, 'openapi');
await app.close();
for (const f of files) console.log(`wrote ${f}`);
