import { existsSync } from 'node:fs';
import * as Sentry from '@sentry/nestjs';

/**
 * Khởi tạo Sentry. Nạp bằng cờ Node `--import ./dist/instrument.js` (scripts dev/start:prod) để Sentry móc vào
 * pino và http TRƯỚC khi app được nạp — với ESM, import trong main.ts là quá muộn cho log và trace.
 * Chỉ bật khi có SENTRY_DSN (local để trống = tắt). Đọc .env trực tiếp vì chạy trước ConfigModule.
 */
if (existsSync('.env')) process.loadEnvFile('.env');

if (process.env.SENTRY_DSN && !Sentry.isInitialized()) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    enableLogs: true, // Sentry Logs: mọi dòng pino (info trở lên) lên Sentry, tìm theo requestId/userId
    integrations: [Sentry.pinoIntegration({ log: { levels: ['info', 'warn', 'error', 'fatal'] } })],
    // Trace (timeline từng bước của request): dev ghi 100 % để soi ngay; prod 10 % vì trace nặng và tốn quota
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1,
    sendDefaultPii: false,
  });
}
