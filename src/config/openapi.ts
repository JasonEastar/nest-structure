import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { INestApplication, Type } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { DocumentBuilder, type OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { z } from 'zod';
import { Public, RequirePermissions } from '../common/auth/decorators.js';
import type { Env } from './env.js';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from './i18n.js';

/**
 * Tài liệu OpenAPI chia theo MODULE NGHIỆP VỤ (danh sách ở app.module.ts OPENAPI_DOCS), không chia app/admin:
 * - /docs            : Swagger UI, dropdown "Select a definition" chuyển giữa các module
 * - /docs/<key>-json : JSON từng định nghĩa · `npm run openapi:export` → openapi/<key>.json (mobile codegen)
 * Mỗi operation được tự động ghi thêm vào mô tả: "Quyền cần có: …" (từ @RequirePermissions) hoặc
 * "Không cần đăng nhập" (từ @Public) — lấy từ metadata guard nên không bao giờ lệch với code.
 *
 * Schema: Swagger 12 đọc zod trực tiếp. Schema body/response đặt `.meta({ id: 'Tên' })` → mục Schemas + $ref.
 * Request: `@Body({ schema })` tự đọc. Response: `@ApiOkResponse({ standardSchema: envelope(Schema) })`.
 */
export interface OpenApiDefinition {
  key: string; // đường dẫn: /docs/<key>-json, openapi/<key>.json
  title: string; // tên trong dropdown
  description: string;
  tags?: { name: string; description: string }[]; // mô tả cho @ApiTags tương ứng
  modules: Type[]; // Swagger include — chỉ controller của các module này
}

type DocEnv = Pick<Env, 'PORT' | 'PUBLIC_URL'>;

/** Shape lỗi thống nhất (khớp ErrorEnvelope trong exceptions.ts); id → Schemas: ErrorResponse. */
const ErrorResponseSchema = z
  .object({
    error: z.object({
      code: z.string().describe('Mã lỗi SCREAMING_SNAKE, client rẽ nhánh theo mã này'),
      message: z.string().describe('Đã dịch theo header Accept-Language (vi mặc định, en)'),
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

/** Phần mô tả chung nối vào cuối mọi định nghĩa: shape response, ngôn ngữ, cách gửi token. */
const COMMON_DESCRIPTION =
  '\n\nThành công: `{ data, meta }` · lỗi: `{ error: { code, message, params, requestId } }`. ' +
  'Ngôn ngữ: header `Accept-Language: vi | en` (mặc định vi), response kèm `Content-Language`. ' +
  'Mọi route cần `Authorization: Bearer <access_token Supabase>` trừ route ghi "Không cần đăng nhập".';

function buildOne(app: INestApplication, def: OpenApiDefinition, env: DocEnv): OpenAPIObject {
  const builder = new DocumentBuilder()
    .setTitle(`C9 Map · ${def.title}`)
    .setDescription(def.description + COMMON_DESCRIPTION)
    .setVersion('1')
    .addServer('/', 'Máy chủ đang mở trang này') // tương đối: dev localhost, Docker/nginx, staging đều đúng
    .addServer(`http://localhost:${env.PORT}`, 'Local')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'supabase')
    // Mọi operation có ô Accept-Language trên Swagger UI → thử đổi ngôn ngữ message lỗi ngay trên trang
    .addGlobalParameters({
      name: 'Accept-Language',
      in: 'header',
      required: false,
      description: 'Ngôn ngữ của message lỗi và nội dung. Mặc định vi.',
      schema: { type: 'string', enum: [...SUPPORTED_LOCALES], default: DEFAULT_LOCALE },
    })
    .addGlobalResponse(
      { status: 401, description: 'UNAUTHENTICATED', standardSchema: ErrorResponseSchema },
      { status: 403, description: 'FORBIDDEN', standardSchema: ErrorResponseSchema },
      { status: 422, description: 'VALIDATION_FAILED', standardSchema: ErrorResponseSchema },
      { status: 429, description: 'RATE_LIMITED', standardSchema: ErrorResponseSchema },
      { status: 500, description: 'INTERNAL', standardSchema: ErrorResponseSchema },
    );
  if (env.PUBLIC_URL) builder.addServer(env.PUBLIC_URL, 'Public'); // staging/prod đặt PUBLIC_URL trong env
  for (const tag of def.tags ?? []) builder.addTag(tag.name, tag.description);

  const document = SwaggerModule.createDocument(app, builder.build(), {
    include: def.modules, // include rỗng = Swagger lấy TẤT CẢ → đã chặn ở buildOpenApiDocuments
    // operationId = Controller.method (bỏ hậu tố Controller) → không trùng giữa module (Location.list vs Pin.list)
    operationIdFactory: (controller: string, method: string) => `${controller.replace(/Controller$/, '')}.${method}`,
  });
  annotateAccess(app, document);
  return document;
}

/**
 * Ghi vào description của từng operation quyền thật sự mà guard sẽ kiểm:
 *   `@Public()`                      → "Không cần đăng nhập" và bỏ ổ khoá (security: [])
 *   `@RequirePermissions([...])`     → "Quyền cần có: `a`, `b`" (metadata method đè class, giống PermissionGuard)
 * Tìm handler qua operationId (Controller.method) trong danh sách controller của DiscoveryService.
 */
function annotateAccess(app: INestApplication, document: OpenAPIObject): void {
  const reflector = app.get(Reflector);
  const handlers = new Map<string, { cls: Type; fn: Function }>();
  for (const wrapper of app.get(DiscoveryService).getControllers()) {
    const cls = wrapper.metatype as Type | undefined;
    if (!cls) continue;
    const short = cls.name.replace(/Controller$/, '');
    for (const method of Object.getOwnPropertyNames(cls.prototype)) {
      const fn = cls.prototype[method as keyof typeof cls.prototype] as unknown;
      if (method !== 'constructor' && typeof fn === 'function') handlers.set(`${short}.${method}`, { cls, fn });
    }
  }
  for (const methods of Object.values(document.paths)) {
    for (const op of Object.values(methods) as { operationId?: string; description?: string; security?: unknown[] }[]) {
      const handler = op.operationId ? handlers.get(op.operationId) : undefined;
      if (!handler) continue;
      const isPublic = reflector.getAllAndOverride(Public, [handler.fn, handler.cls]);
      const required = reflector.getAllAndOverride(RequirePermissions, [handler.fn, handler.cls]);
      const notes: string[] = [];
      if (isPublic) {
        notes.push('**Không cần đăng nhập.**');
        op.security = [];
      } else if (required?.length) {
        notes.push(`**Quyền cần có:** ${required.map((p: string) => `\`${p}\``).join(', ')}`);
      }
      if (notes.length) op.description = [op.description, ...notes].filter(Boolean).join('\n\n');
    }
  }
}

export function buildOpenApiDocuments(app: INestApplication, defs: OpenApiDefinition[], env: DocEnv): Map<string, OpenAPIObject> {
  const out = new Map<string, OpenAPIObject>();
  for (const def of defs) {
    if (def.modules.length === 0) throw new Error(`OPENAPI_DOCS "${def.key}" rỗng: liệt kê module cho định nghĩa này`);
    if (out.has(def.key)) throw new Error(`OPENAPI_DOCS trùng key "${def.key}"`);
    out.set(def.key, buildOne(app, def, env));
  }
  return out;
}

/** Mount Swagger UI tại /docs (định nghĩa đầu tiên mở sẵn, dropdown chuyển), JSON tại /docs/<key>-json. */
export function setupOpenApi(app: INestApplication, defs: OpenApiDefinition[], env: DocEnv): void {
  const documents = buildOpenApiDocuments(app, defs, env);
  const urls = defs.map((d) => ({ url: `/docs/${d.key}-json`, name: d.title }));
  const ui = { explorer: true, swaggerOptions: { urls, persistAuthorization: true, displayRequestDuration: true } };
  defs.forEach((def, i) => {
    // Định nghĩa đầu tiên mount ở /docs (điểm vào); các định nghĩa khác chỉ cần JSON, mount ở /docs/<key>
    SwaggerModule.setup(i === 0 ? 'docs' : `docs/${def.key}`, app, documents.get(def.key)!, {
      ...ui,
      useGlobalPrefix: false,
      jsonDocumentUrl: `docs/${def.key}-json`,
      customSiteTitle: `C9 Map API · ${def.title}`,
    });
  });
}

/** Ghi openapi/<key>.json cho từng định nghĩa (CI artifact → mobile codegen). */
export async function exportOpenApi(app: INestApplication, defs: OpenApiDefinition[], env: DocEnv, outDir: string): Promise<string[]> {
  const documents = buildOpenApiDocuments(app, defs, env);
  await mkdir(outDir, { recursive: true });
  const written: string[] = [];
  for (const [key, document] of documents) {
    const file = join(outDir, `${key}.json`);
    await writeFile(file, JSON.stringify(document, null, 2));
    written.push(file);
  }
  return written;
}
