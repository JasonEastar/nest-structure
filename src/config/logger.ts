import { ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import type { Env } from './env.js';
import { resolveRequestId } from '../common/http/request-context.middleware.js';

/**
 * Log JSON một dòng mỗi request (requestId, userId, instance), ẩn bí mật, bỏ qua /health.
 * Nơi nhận: stdout luôn (dev in đẹp bằng pino-pretty); có AXIOM_TOKEN + AXIOM_DATASET thì gửi thêm lên Axiom.
 */
export const PinoLoggerModule = LoggerModule.forRootAsync({
  inject: [ConfigService],
  useFactory: (config: ConfigService<Env, true>) => {
    const isDev = config.get('NODE_ENV', { infer: true }) === 'development';
    const instance = config.get('INSTANCE_ID', { infer: true });
    const level = config.get('LOG_LEVEL', { infer: true });
    const axiom = { token: config.get('AXIOM_TOKEN', { infer: true }), dataset: config.get('AXIOM_DATASET', { infer: true }) };

    // Mỗi target là một nơi nhận log; pino chạy chúng ở worker thread riêng, không chặn request
    const targets = [
      isDev ? { target: 'pino-pretty', options: { singleLine: true }, level } : { target: 'pino/file', options: { destination: 1 }, level },
      ...(axiom.token && axiom.dataset ? [{ target: '@axiomhq/pino', options: { dataset: axiom.dataset, token: axiom.token }, level }] : []),
    ];
    return {
      pinoHttp: {
        level,
        base: { instance, env: config.get('NODE_ENV', { infer: true }) }, // mọi dòng log (kể cả ngoài request) có instance; bỏ pid/hostname mặc định cho gọn
        genReqId: (req) => resolveRequestId(req as Parameters<typeof resolveRequestId>[0]),
        customProps: (req) => ({ userId: (req as unknown as { user?: { id?: string } }).user?.id }),
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
        transport: { targets },
      },
    };
  },
});
