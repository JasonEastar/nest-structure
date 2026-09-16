import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import type { Env } from '../config/env.js';
import { resolveRequestId } from './request-context.middleware.js';

/**
 * nestjs-pino: một dòng JSON mỗi request với requestId + instance; redact bí mật.
 * Dev: pino-pretty. Không log /health/* (probe mỗi vài giây).
 */
export const PinoLoggerModule = LoggerModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) => {
    const isDev = config.get('NODE_ENV', { infer: true }) === 'development';
    const instance = config.get('INSTANCE_ID', { infer: true });
    return {
      pinoHttp: {
        level: config.get('LOG_LEVEL', { infer: true }),
        genReqId: (req) => resolveRequestId(req as Parameters<typeof resolveRequestId>[0]),
        customProps: (req) => ({
          instance,
          userId: (req as unknown as { user?: { id?: string } }).user?.id, // pino IncomingMessage, không phải Express Request
        }),
        autoLogging: {
          ignore: (req) => (req.url ?? '').startsWith('/health'),
        },
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'req.headers["x-device-id"]',
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
