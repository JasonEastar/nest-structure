import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { INestApplication, Type } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { z } from 'zod';
import type { Env } from './env.js';

/**
 * Hai tài liệu OpenAPI (docs.nestjs.com/openapi):
 * - /docs/app   : API cho mobile (module nghiệp vụ)      · JSON: /docs/app-json
 * - /docs/admin : API quản trị, không lộ cho app          · JSON: /docs/admin-json
 * Cả hai trang có dropdown "Select a definition" để chuyển qua lại (explorer + urls).
 *
 * Schema: Swagger 12 đọc zod trực tiếp. Mọi schema DTO đặt `.meta({ id: 'TênSchema' })` → xuất hiện trong
 * mục "Schemas" (components.schemas) và được $ref thay vì inline — mobile codegen sinh đúng tên type.
 * Request: `@Body({ schema })` tự đọc. Response: `@ApiOkResponse({ standardSchema: envelope(Schema) })`.
 */
export interface OpenApiDocs {
  app: Type[];
  admin: Type[];
}

/** Shape lỗi thống nhất (khớp ErrorEnvelope trong exceptions.ts); id → Schemas: ErrorResponse. */
const ErrorResponseSchema = z
  .object({
    error: z.object({
      code: z.string().describe('Mã lỗi SCREAMING_SNAKE, client rẽ nhánh theo mã này'),
      message: z.string().describe('Đã dịch theo ?lang / Accept-Language (vi mặc định, en)'),
      params: z.record(z.string(), z.unknown()).describe('Dữ liệu phụ: resource, retryAfter, issues…'),
      requestId: z.string().describe('Gửi kèm khi báo lỗi để tra log'),
    }),
  })
  .meta({ id: 'ErrorResponse' });

const MetaSchema = z.object({
  requestId: z.string(),
  nextCursor: z.string().nullable().optional().describe('Chỉ có ở endpoint list: null = hết trang'),
});

/** Bọc schema dữ liệu thành envelope { data, meta } cho @ApiOkResponse/@ApiCreatedResponse({ standardSchema }). */
export function envelope<T extends z.ZodType>(data: T) {
  return z.object({ data, meta: MetaSchema });
}

function baseBuilder(title: string, description: string, env: Pick<Env, 'PORT' | 'PUBLIC_URL'>): DocumentBuilder {
  const b = new DocumentBuilder()
    .setTitle(title)
    .setDescription(description)
    .setVersion('1')
    .addServer('/', 'Máy chủ đang mở trang này') // tương đối: dev localhost, Docker/nginx, staging đều đúng
    .addServer(`http://localhost:${env.PORT}`, 'Local')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'supabase')
    .addGlobalResponse(
      { status: 401, description: 'UNAUTHENTICATED', standardSchema: ErrorResponseSchema },
      { status: 403, description: 'FORBIDDEN', standardSchema: ErrorResponseSchema },
      { status: 422, description: 'VALIDATION_FAILED', standardSchema: ErrorResponseSchema },
      { status: 429, description: 'RATE_LIMITED', standardSchema: ErrorResponseSchema },
      { status: 500, description: 'INTERNAL', standardSchema: ErrorResponseSchema },
    );
  if (env.PUBLIC_URL) b.addServer(env.PUBLIC_URL, 'Public'); // staging/prod đặt PUBLIC_URL trong env
  return b;
}

export function buildOpenApiDocuments(
  app: INestApplication,
  docs: OpenApiDocs,
  env: Pick<Env, 'PORT' | 'PUBLIC_URL'>,
): Record<'app' | 'admin', OpenAPIObject> {
  // SwaggerModule: include rỗng = lấy TẤT CẢ module → admin lộ vào /docs/app. Bắt buộc liệt kê tường minh.
  for (const [name, mods] of Object.entries(docs)) {
    if (mods.length === 0) throw new Error(`OPENAPI_DOCS.${name} rỗng: liệt kê module cho tài liệu này`);
  }
  const options = {
    // operationId = Controller.method (bỏ hậu tố Controller) → không trùng giữa module (Location.list vs Pin.list)
    operationIdFactory: (controller: string, method: string) => `${controller.replace(/Controller$/, '')}.${method}`,
  };
  return {
    app: SwaggerModule.createDocument(
      app,
      baseBuilder(
        'C9 Map API',
        'API cho ứng dụng di động. Thành công: { data, meta } · lỗi: { error: { code, message, params, requestId } }. ' +
          'Ngôn ngữ: ?lang=vi|en hoặc Accept-Language (mặc định vi), response kèm Content-Language.',
        env,
      ).build(),
      { ...options, include: docs.app },
    ),
    admin: SwaggerModule.createDocument(
      app,
      baseBuilder('C9 Map Admin API', 'API quản trị (permission role:manage, report:review, ...)', env).build(),
      { ...options, include: docs.admin },
    ),
  };
}

/** Mount Swagger UI: /docs/app, /docs/admin, mỗi trang có dropdown chuyển định nghĩa; JSON tại /docs/<name>-json. */
export function setupOpenApi(app: INestApplication, docs: OpenApiDocs, env: Pick<Env, 'PORT' | 'PUBLIC_URL'>): void {
  const documents = buildOpenApiDocuments(app, docs, env);
  const urls = [
    { url: '/docs/app-json', name: 'App' },
    { url: '/docs/admin-json', name: 'Admin' },
  ];
  for (const name of ['app', 'admin'] as const) {
    SwaggerModule.setup(`docs/${name}`, app, documents[name], {
      useGlobalPrefix: false,
      jsonDocumentUrl: `docs/${name}-json`,
      customSiteTitle: `C9 Map · ${name}`,
      explorer: true, // thanh "Select a definition"
      swaggerOptions: { urls, persistAuthorization: true, displayRequestDuration: true },
    });
  }
}

/** Ghi openapi/app.json + openapi/admin.json (CI artifact → mobile codegen). */
export async function exportOpenApi(
  app: INestApplication,
  docs: OpenApiDocs,
  env: Pick<Env, 'PORT' | 'PUBLIC_URL'>,
  outDir: string,
): Promise<string[]> {
  const documents = buildOpenApiDocuments(app, docs, env);
  await mkdir(outDir, { recursive: true });
  const written: string[] = [];
  for (const name of ['app', 'admin'] as const) {
    const file = join(outDir, `${name}.json`);
    await writeFile(file, JSON.stringify(documents[name], null, 2));
    written.push(file);
  }
  return written;
}
