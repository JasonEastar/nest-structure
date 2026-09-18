import { existsSync } from 'node:fs';
import * as Sentry from '@sentry/nestjs';

/**
 * Khởi tạo Sentry. Nạp bằng cờ Node `--import ./dist/instrument.js` (scripts dev/start:prod, Dockerfile) để Sentry móc vào
 * pino và http TRƯỚC khi app được nạp — với ESM, import trong main.ts là quá muộn cho log và trace.
 * Chỉ bật khi có SENTRY_DSN; không có thì mọi lệnh Sentry là no-op. Đọc .env trực tiếp vì chạy trước ConfigModule.
 */
if (existsSync('.env')) process.loadEnvFile('.env');

if (process.env.SENTRY_DSN && !Sentry.isInitialized()) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV ?? 'development',
    enableLogs: true, // Sentry Logs: mọi dòng pino (info trở lên) lên Sentry, tìm theo requestId/userId
    integrations: [Sentry.pinoIntegration({ log: { levels: ['info', 'warn', 'error', 'fatal'] } })],
    tracesSampleRate: 0.1, // 10 % request có trace (thời gian từng bước); tăng khi cần soi hiệu năng
    sendDefaultPii: false,
    debug: process.env.SENTRY_DEBUG === '1', // in ra những gì SDK gửi, dùng khi nghi Sentry không nhận
  });
}
