# Phase 04 — `common/`: exceptions, `StandardSchemaValidationPipe`, response envelope, request-context, pino, i18n, Swagger ×2

## Context links
- [plan.md](./plan.md) · [code-standards §2.5 API](../../docs/code-standards.md) · [system-architecture §4, §10, §11, §13](../../docs/system-architecture.md) · [nestjs-guide §4–§6](../../docs/nestjs-guide.md) · [ADR-0006](../../docs/adr/0006-all-in-one-cau-truc-don-gian.md)
- NestJS docs [01](../reports/nestjs-docs-01-overview-fundamentals.md) (filters, pipes, interceptors, middleware), [03 OpenAPI](../reports/nestjs-docs-03-security-openapi.md)

## Overview
**Ngày:** 2026-09-16 · **Ưu tiên:** P0 · **Trạng thái:** ☐ Chưa bắt đầu
Chốt shape lỗi/response và tài liệu API trước endpoint nghiệp vụ đầu tiên. Mọi thứ nằm phẳng trong `src/common/`, mỗi file một việc; enhancer toàn cục đăng ký bằng token `APP_*` trong `app.module.ts`.

## Key insights
- Validation: `StandardSchemaValidationPipe` (`@nestjs/common` 12) qua `APP_PIPE` với `exceptionFactory` → `AppException(VALIDATION_FAILED, { issues })`. Controller: `@Body({ schema })`, `@Query({ schema })`, `@Param('id', { schema: z.uuid() })`. DTO zod nằm ở `modules/<x>/<x>.dto.ts`.
- Swagger 12 tự đọc Standard Schema từ decorator (zod 4.6.5 có `~standard.jsonSchema`, đã verify). Response: helper `zodResponse(schema)` trong `common/openapi.ts` → `@ApiOkResponse({ schema })`. Fallback `zod-openapi` chỉ khi output sai (hỏi trước).
- 2 document qua `include: [modules]`: `/docs/app` (IdentityModule, PinModule…) và `/docs/admin` (controller admin gom qua module riêng hoặc `include` theo controller class — chọn: tách `identity-admin.controller.ts` vào `IdentityAdminModule` nhỏ trong cùng thư mục nếu `include` không lọc theo controller). `jsonDocumentUrl: 'docs/app-json'`, `useGlobalPrefix: false`, `addBearerAuth()`, `addGlobalResponse` 401/403/429/500, `operationIdFactory: (_c, m) => m`.
- `setGlobalPrefix('api', { exclude: [{ path: 'health/*splat', method: RequestMethod.GET }, 'docs/*splat'] })` — docs FAQ: không `*` trần. Kiểm thực tế với Express 5.
- `RequestContextMiddleware` (class, `forRoutes('*')`, có DI): `X-Instance-Id` + `X-Request-Id` (echo header từ nginx, sinh uuid v7 nếu thiếu), gắn `req.id`. `nestjs-pino` `genReqId` đọc `req.id`.
- `ErrorCodes` + `AppException` + `AllExceptionsFilter` **cùng file** `common/exceptions.ts` (dưới 200 dòng). Server trả mã, client dịch.
- `common/response.ts`: `ResponseInterceptor` bọc `{ data, meta: { requestId } }` (bỏ qua `/health/*`, `/docs/*`, `StreamableFile`), envelope zod schema, cursor pagination helper.
- i18n server chỉ cho push/category; module dựng sẵn resolver `user.locale → Accept-Language → vi`.
- `helmet()` trước mọi middleware; `trust proxy` = 1.

## Requirements
- `GET /api/v1/__nope` → 404 `{ error: { code: "NOT_FOUND", params: {}, requestId } }`.
- Body sai zod → 422 `VALIDATION_FAILED` + `params.issues[{ path, message }]`.
- Log 1 dòng JSON/request: `requestId`, `instance`, `method`, `url`, `status`, `responseTime`; không log `/health/*`.
- `/docs/app`, `/docs/admin` mở được; body request hiển thị đúng zod; `openapi/app.json`, `openapi/admin.json` sinh ra.
- `Accept-Language: en` → `I18nService.t('common.hello')` tiếng Anh; mặc định `vi`.

## Architecture
```
src/common/
├── exceptions.ts                 # ErrorCodes, AppException(code, params?, status), AllExceptionsFilter (@Catch())
├── validation.ts                 # export const ValidationPipeProvider = { provide: APP_PIPE, useFactory: () => new StandardSchemaValidationPipe({ exceptionFactory }) }
├── response.ts                   # ResponseInterceptor (APP_INTERCEPTOR) · okEnvelope/errorEnvelope zod · cursor helpers
├── request-context.middleware.ts # X-Instance-Id · X-Request-Id · req.id
├── logger.ts                     # LoggerModule.forRoot (nestjs-pino): genReqId, redact, autoLogging ignore health, customProps instance/userId
├── i18n.ts                       # I18nModule.forRoot + LocaleResolver
└── openapi.ts                    # buildOpenApi(app): 2 document + setup; exportOpenApi(app, dir); zodResponse(schema)
src/app.module.ts                 # imports: ConfigModule, CommonModule, LoggerModule(logger.ts), I18nModule(i18n.ts), HealthModule, IdentityModule…
                                  # providers: ValidationPipeProvider, { APP_FILTER: AllExceptionsFilter }, { APP_INTERCEPTOR: ResponseInterceptor }
                                  # configure(consumer): RequestContextMiddleware forRoutes('*')
src/main.ts                       # helmet · set('trust proxy',1) · setGlobalPrefix('api',{exclude}) · enableVersioning(URI,'1') · buildOpenApi(app) · listen
src/openapi-export.ts             # entry riêng: create app (không listen) → exportOpenApi → close   (script openapi:export = nest build && node dist/openapi-export.js)
i18n/vi/common.json · i18n/en/common.json
```

## Related code files (CREATE)
- `src/common/{exceptions.ts, validation.ts, response.ts, request-context.middleware.ts (sửa), logger.ts, i18n.ts, openapi.ts}`
- `src/openapi-export.ts`, `i18n/{vi,en}/common.json`
- sửa `src/main.ts`, `src/app.module.ts`; `package.json` script `openapi:export`; `nest-cli.json` `assets: ["i18n/**/*"]` nếu cần copy vào `dist`

## Implementation steps
1. Cài deps phase 04 (`helmet` kèm).
2. `exceptions.ts`: `ErrorCodes` (`NOT_FOUND`, `VALIDATION_FAILED`, `UNAUTHENTICATED`, `FORBIDDEN`, `RATE_LIMITED`, `INTERNAL`…), `AppException`, `AllExceptionsFilter` map `HttpException` → mã tương ứng, lỗi lạ → 500 `INTERNAL` + log stack; response luôn có `requestId`.
3. `validation.ts` provider `APP_PIPE`.
4. `response.ts` interceptor + envelope schema + cursor `encode/decode(created_at,id)`.
5. `request-context.middleware.ts` đầy đủ; `logger.ts` pino config (`pino-pretty` chỉ dev).
6. `i18n.ts` + 2 file JSON; `LocaleResolver` (tạm chỉ `Accept-Language` → `user.locale` thêm phase 06).
7. `openapi.ts`: 2 `DocumentBuilder`, `SwaggerModule.createDocument(app, cfg, { include, operationIdFactory })`, `setup` ×2; `zodResponse`; `exportOpenApi`.
8. `main.ts` thứ tự: helmet → trust proxy → prefix/exclude → versioning → openapi → listen. `app.module.ts` gom providers `APP_*` + `configure`.
9. `openapi-export.ts` entry + script; chạy `npm run openapi:export`.

## Todo
- [ ] exceptions.ts (ErrorCodes, AppException, filter) + `process.on('unhandledRejection'|'uncaughtException')` trong main.ts
- [ ] validation.ts APP_PIPE + exceptionFactory
- [ ] response.ts interceptor + envelope + cursor
- [ ] request-context middleware + logger.ts pino
- [ ] i18n.ts + JSON vi/en
- [ ] openapi.ts 2 docs + zodResponse + export entry
- [ ] main.ts / app.module.ts wiring; prefix exclude kiểm thực tế
- [ ] Helper `zText(max)` (trim + strip HTML) trong `common/validation.ts` cho text người dùng
- [ ] Readiness 503 khi đang shutdown (`ShutdownState` set trong `beforeApplicationShutdown`)

## Success criteria
```
curl -s :3000/api/v1/__nope | jq -e '.error.code=="NOT_FOUND" and (.error.requestId|length>0)'
curl -s -X POST :3000/api/v1/__validate -H 'content-type: application/json' -d '{}' | jq -e '.error.code=="VALIDATION_FAILED"'   # route mẫu tạm, xoá sau
curl -s -D - :3000/health/live -o /dev/null | grep -E "X-Request-Id|X-Instance-Id"
curl -s -o /dev/null -w "%{http_code}" :3000/docs/app        # 200
curl -s :3000/docs/app-json | jq -e '.openapi'
npm run openapi:export && ls openapi/app.json openapi/admin.json
```

## Risk assessment
| Rủi ro | Phòng |
|---|---|
| `setGlobalPrefix` exclude sai cú pháp Express 5 | Test `/health/live` trong success criteria; đổi sang `:splat*` nếu cần |
| Swagger không render zod | `zod-openapi` + `standardSchemaConverter` (hỏi trước khi cài) |
| `include` không lọc controller admin ra khỏi `/docs/app` | Tách `IdentityAdminModule` nhỏ cùng thư mục |
| Interceptor bọc nhầm health/docs | Bỏ qua theo `req.path` prefix |

## Security considerations
- Lỗi 500 không lộ stack ra client; chỉ log.
- Redact `authorization`, `cookie`, `*.token`, `*.phone`, toạ độ user trong pino.
- `helmet` mặc định; CORS chưa bật (mobile không cần) — thêm whitelist khi có admin web.

## Next steps
→ [phase-05](./phase-05-redis-cache-throttle-queue.md): Redis, cache, throttler, BullMQ.
