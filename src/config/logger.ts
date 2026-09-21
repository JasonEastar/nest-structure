import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import type { Env } from './env.js';
import { resolveRequestId } from '../common/http/request-context.middleware.js';

/**
 * Log JSON một dòng mỗi request (requestId, userId), ẩn bí mật, bỏ qua /health.
 * Nơi nhận: stdout (dev in đẹp bằng pino-pretty, prod JSON). Có SENTRY_DSN thì Sentry tự bắt thêm qua pinoIntegration (instrument.ts).
 */
export const PinoLoggerModule = LoggerModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) => {
    const env = config.get('NODE_ENV', { infer: true });
    const isDev = env === 'development';
    const level = { development: 'debug', test: 'warn', production: 'info' }[env]; // theo môi trường, không cần env riêng
    return {
      pinoHttp: {
        level,
        base: { env }, // bỏ pid/hostname mặc định cho gọn
        genReqId: (req) => resolveRequestId(req as Parameters<typeof resolveRequestId>[0]),
        customProps: (req) => ({ userId: (req as unknown as { user?: { id?: string } }).user?.id }),
        autoLogging: {
          ignore: (req) => (req.url ?? '').startsWith('/health'),
        },
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            '*.token',
            '*.password',
            '*.phone',
            '*.lat',
            '*.lng',
          ],
          censor: '[redacted]',
        },
        serializers: {
          req: (req: { id: string; method: string; url: string }) => ({
            id: req.id,
            method: req.method,
            url: req.url,
          }),
          res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
        },
        transport: isDev ? { target: 'pino-pretty', options: { singleLine: true } } : undefined,
      },
    };
  },
});
