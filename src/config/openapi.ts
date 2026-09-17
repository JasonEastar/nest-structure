import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { INestApplication, Type } from '@nestjs/common';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { z } from 'zod';

/**
 * Hai tài liệu OpenAPI (theo docs.nestjs.com/openapi):
 * - /docs/app   : API cho mobile (module nghiệp vụ)
 * - /docs/admin : API quản trị (module admin) — không lộ cho app
 * Request body/query/param: Swagger 12 tự đọc schema zod trên decorator (@Body({ schema })).
 * Response: dùng `zodResponse(schema)` trong @ApiOkResponse.
 * JSON: /docs/app-json, /docs/admin-json → CI ghi ra openapi/*.json cho mobile codegen.
 */
export interface OpenApiDocs {
  app: Type[];
  admin: Type[];
}

/** Shape lỗi cho tài liệu (khớp ErrorEnvelope trong exceptions.ts). */
const ERROR_ENVELOPE = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(), // đã dịch theo ?lang / Accept-Language (vi mặc định, en)
    params: z.record(z.string(), z.unknown()),
    requestId: z.string(),
  }),
});

function baseBuilder(title: string, description: string): DocumentBuilder {
  const errorSchema = zodResponse(ERROR_ENVELOPE);
  return new DocumentBuilder()
    .setTitle(title)
    .setDescription(description)
    .setVersion('1')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'supabase')
    .addGlobalResponse(
      { status: 401, description: 'UNAUTHENTICATED', schema: errorSchema },
      { status: 403, description: 'FORBIDDEN', schema: errorSchema },
      { status: 422, description: 'VALIDATION_FAILED', schema: errorSchema },
      { status: 429, description: 'RATE_LIMITED', schema: errorSchema },
      { status: 500, description: 'INTERNAL', schema: errorSchema },
    );
}

export function buildOpenApiDocuments(app: INestApplication, docs: OpenApiDocs): Record<'app' | 'admin', OpenAPIObject> {
  // SwaggerModule: include rỗng = lấy TẤT CẢ module → admin lộ vào /docs/app. Bắt buộc liệt kê tường minh.
  for (const [name, mods] of Object.entries(docs)) {
    if (mods.length === 0) throw new Error(`OPENAPI_DOCS.${name} rỗng: liệt kê module cho tài liệu này`);
  }
  const options = { operationIdFactory: (_controller: string, method: string) => method };
  return {
    app: SwaggerModule.createDocument(
      app,
      baseBuilder('C9 Map API', 'API cho ứng dụng di động. Response: { data, meta } · lỗi: { error: { code, message, params, requestId } }. Ngôn ngữ: ?lang=vi|en hoặc Accept-Language (mặc định vi), response kèm Content-Language.').build(),
      { ...options, include: docs.app },
    ),
    admin: SwaggerModule.createDocument(
      app,
      baseBuilder('C9 Map Admin API', 'API quản trị (permission role:manage, report:review, ...)').build(),
      { ...options, include: docs.admin },
    ),
  };
}

/** Mount Swagger UI: /docs/app, /docs/admin (+ JSON tại /docs/app-json, /docs/admin-json). */
export function setupOpenApi(app: INestApplication, docs: OpenApiDocs): void {
  const documents = buildOpenApiDocuments(app, docs);
  for (const name of ['app', 'admin'] as const) {
    SwaggerModule.setup(`docs/${name}`, app, documents[name], {
      useGlobalPrefix: false,
      jsonDocumentUrl: `docs/${name}-json`,
      customSiteTitle: `C9 Map · ${name}`,
      swaggerOptions: { persistAuthorization: true },
    });
  }
}

/** Ghi openapi/app.json + openapi/admin.json (CI artifact → mobile codegen). */
export async function exportOpenApi(app: INestApplication, docs: OpenApiDocs, outDir: string): Promise<string[]> {
  const documents = buildOpenApiDocuments(app, docs);
  await mkdir(outDir, { recursive: true });
  const written: string[] = [];
  for (const name of ['app', 'admin'] as const) {
    const file = join(outDir, `${name}.json`);
    await writeFile(file, JSON.stringify(documents[name], null, 2));
    written.push(file);
  }
  return written;
}

/** zod → JSON Schema cho @ApiOkResponse({ schema: zodResponse(MySchema) }). Bọc envelope { data, meta }. */
export function zodResponse(schema: z.ZodType, envelope = false): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'output' }) as Record<string, unknown>;
  if (!envelope) return json;
  return {
    type: 'object',
    required: ['data', 'meta'],
    properties: {
      data: json,
      meta: {
        type: 'object',
        required: ['requestId'],
        properties: { requestId: { type: 'string' }, nextCursor: { type: 'string', nullable: true } },
      },
    },
  };
}
