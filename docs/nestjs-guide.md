# NestJS 12 — cách C9 Map dùng từng tính năng

**Cập nhật:** 2026-09-16 · **Trạng thái:** Active · **Chủ sở hữu:** Tech Lead
Bản chắt lọc từ toàn bộ docs.nestjs.com (Overview, Fundamentals, Techniques, Security, OpenAPI, CLI, Recipes, FAQ, Migration v12) và skill `.claude/skills/nestjs-best-practices` (40 rule, §12) cho một modular monolith chạy nhiều instance. Mỗi mục: NestJS cung cấp gì → C9 Map dùng / tránh và vì sao. Chi tiết gốc: `plans/reports/nestjs-docs-0{1,2,3,4}-*.md`. Cấu hình hạ tầng xem [system-architecture.md](./system-architecture.md).

---

## 1. Sự thật đã xác minh trên NestJS 12 (2026-09-16)

| Điểm | Thực tế | Nguồn |
|---|---|---|
| Phiên bản | `@nestjs/core` 12.0.3, `@nestjs/cli` 12.0.1, `@nestjs/swagger` 12.0.1 | `npm view` |
| Node | Runtime ≥ 20.19 / ≥ 22.12; CLI (`nest new`, `nest g`) ≥ 22.22.3 / 24.15. Local: 24.14 ✓ | migration.md |
| ESM | Package Nest ship ESM; **`nest new` 12.0.1 scaffold app cũng ESM** (`"type": "module"`, `nodenext`, import hậu tố `.js`, top-level await). Theo scaffold; `import.meta.dirname` thay `__dirname` | migration.md, `package.json` `type: module` |
| Validation zod | `StandardSchemaValidationPipe` có sẵn trong `@nestjs/common`; `@Body({ schema })`, `@Query({ schema })`, `@Param('id', { schema })`, `@RawBody({ schema })` | `pipes/standard-schema-validation.pipe.d.ts` |
| Swagger + zod | Swagger đọc `schema` trên decorator và tự chuyển nếu lib có `~standard.jsonSchema`. zod 4.6.5 **có** → không cần converter | openapi/introduction.md + kiểm tra runtime |
| Config + zod | `ConfigModule.forRoot({ validationSchema })` nhận Standard Schema (zod) trực tiếp | migration.md |
| Terminus | API cũ (`HealthIndicator`, `HealthCheckError`) đã xoá; dùng `HealthIndicatorService.check(key).up()/down()` | migration.md |
| Builder | `nest build` mặc định `tsc` cho project đơn; webpack deprecated, Rspack chỉ khi cần bundle | migration.md |
| Route | `routeConflictPolicy`, `routeResolutionStrategy: 'specificity'` opt-in | nest-application-options |

## 2. Vòng đời request (thứ tự cố định)

```
Middleware → Guards → Interceptors (trước) → Pipes → Controller → Service → Interceptors (sau) → Exception filters → Response
```

- Guard chạy **trước** pipe → guard không được phụ thuộc body đã validate.
- Filter: chỉ filter **đầu tiên** khớp được chạy; `@Catch()` bắt tất cả phải đứng sau filter cụ thể.
- `Reflector.getAllAndOverride(key, [handler, class])`: metadata ở method **đè** class.

## 3. Cấu trúc ứng dụng

| NestJS cung cấp | C9 Map dùng | Vì sao |
|---|---|---|
| `nest new` (project đơn, mặc định) | Một project, all-in-one, cấu trúc [ADR-0006](./adr/0006-all-in-one-cau-truc-don-gian.md): `src/{main.ts, app.ts, app.module.ts, config/, common/, modules/}` | Ít file wiring nhất; mobile chỉ cần OpenAPI nên không cần `libs/` |
| `nest g resource <name>` | Scaffold module rồi sửa theo quy ước dự án (`dto/<use-case>.dto.ts`, `schema/<x>.schema.ts` thay `entities/`; bỏ spec mặc định, test nằm ở `test/`) | Nhanh, đúng convention |
| `@Module({ imports, providers, controllers, exports })`, `@Global()` | Module theo nghiệp vụ; `@Global()` chỉ cho `CommonModule` (gom DB, Redis, cache, queue, Supabase) và `ConfigModule` | Ranh giới module = quy tắc bất biến |
| Dynamic module `forRoot/forRootAsync`, `ConfigurableModuleBuilder` | Chỉ khi module cần cấu hình từ env (`BullModule.forRootAsync`, `ThrottlerModule.forRootAsync`); provider thường thì dùng `useFactory` + `ConfigService` | YAGNI |
| Injection scope `DEFAULT / REQUEST / TRANSIENT` | **Chỉ singleton**. NEVER `Scope.REQUEST` | Request scope lan lên toàn cây phụ thuộc, tốn hiệu năng, không cần vì app stateless |
| `forwardRef`, `ModuleRef` | Tránh; vòng phụ thuộc = thiết kế sai. `ModuleRef.get` chỉ trong test | Đơn giản |
| Lazy-loading module | Không | Monolith boot nhanh |
| Lifecycle: `onModuleInit → onApplicationBootstrap → onModuleDestroy → beforeApplicationShutdown → onApplicationShutdown` | `app.enableShutdownHooks()`; `@nestjs/bullmq` tự `close()` worker khi shutdown | Graceful shutdown khi `docker compose stop` |
| Standalone `createApplicationContext` | Không dùng (all-in-one) | Processor sống trong process HTTP; job data vẫn validate bằng zod trong `*.jobs.ts` |
| `DiscoveryService` | Có: `config/openapi.ts` đọc metadata guard để ghi quyền vào Swagger | Docs không lệch với code |

## 4. Enhancer toàn cục — đăng ký bằng token trong module, không `app.useGlobal*`

```ts
// src/app.module.ts (providers)
{ provide: APP_GUARD,       useClass: AppThrottlerGuard }   // 1. rate limit trước khi tốn CPU verify JWT
{ provide: APP_GUARD,       useClass: AuthGuard }           // 2. Bearer → JWKS → req.user; @Public() bỏ qua
{ provide: APP_GUARD,       useClass: PermissionGuard }     // 3. @RequirePermissions(['pin:create'])
{ provide: APP_PIPE,        useFactory: () => new StandardSchemaValidationPipe({ exceptionFactory }) }
{ provide: APP_FILTER,      useClass: AllExceptionsFilter } // { success:false, code, msg, data:null, meta }
{ provide: APP_INTERCEPTOR, useClass: ResponseInterceptor } // { success, code, msg, data, meta } — không bọc StreamableFile
```

- Lý do dùng token: test override được bằng `Test.createTestingModule().overrideProvider()`; enhancer nhận DI.
- Middleware cần DI (request-id, pino) → class middleware `configure(consumer).apply(...).forRoutes('*')`, không `app.use()`.
- `app.ts` tạo app: `rawBody: true`, helmet, `trust proxy`, `setGlobalPrefix('api', { exclude })`, `enableVersioning`, `enableShutdownHooks`. `main.ts` chỉ: gọi `createApp()`, gắn Swagger, `keepAliveTimeout`, listen. CORS chưa bật (mobile không cần).

## 5. Validation & DTO (schema-first, không class-validator)

| NestJS cung cấp | C9 Map dùng |
|---|---|
| `ValidationPipe` (class-validator) | **Không** |
| `StandardSchemaValidationPipe({ transform: true })` toàn cục qua `APP_PIPE` | Có. `exceptionFactory` → `AppException('VALIDATION_FAILED', { issues })` |
| `@Body({ schema: CreatePinSchema })`, `@Query({ schema })`, `@Param('id', { schema: z.uuid() })` | Có. Schema import từ `modules/<x>/dto/<use-case>.dto.ts`; kiểu handler = `z.infer<typeof CreatePinSchema>` |
| `ParseUUIDPipe`, `ParseIntPipe`… | Không cần — zod `coerce` làm việc đó |
| `ClassSerializerInterceptor` | Không — service trả plain object đã lọc, response schema cũng là zod trong contracts |

Quy tắc: mỗi use case có **RequestSchema**, **ResponseSchema** và mapper `toXxxResponse` trong `src/modules/<x>/dto/<use-case>.dto.ts`; controller không tự viết type.

## 6. OpenAPI (`@nestjs/swagger`, theo docs.nestjs.com/openapi)

- `DocumentBuilder().setTitle().setVersion('1').addBearerAuth().addGlobalResponse(401|403|422|429|500 → ErrorResponse)`.
- `SwaggerModule.createDocument(app, cfg, { include: [<module>], operationIdFactory: (c, m) => `${c.replace(/Controller$/, '')}.${m}` })` một lần mỗi định nghĩa (theo module nghiệp vụ, `OPENAPI_DOCS`).
- `SwaggerModule.setup('docs', app, doc, { explorer: true, swaggerOptions: { urls }, jsonDocumentUrl: 'docs/<key>-json', useGlobalPrefix: false })` → dropdown chuyển định nghĩa.
- Sau `createDocument`: duyệt `paths`, tra `Reflector` (`@Public`, `@RequirePermissions`) qua `DiscoveryService.getControllers()` để ghi "Quyền cần có"/"Không cần đăng nhập" vào description (config/openapi.ts `annotateAccess`).
- Request body/query/param lấy từ `schema` trên decorator — **không** cần `@ApiProperty` cho DTO zod. Response: `@ApiOkResponse({ standardSchema: envelope(ZodSchema) })`; schema có `.meta({ id })` → `components.schemas` + `$ref`.
- Fallback nếu schema sinh sai: `zod-openapi` + `standardSchemaConverter` (chỉ khi cần).
- CLI plugin `@nestjs/swagger` trong `nest-cli.json`: **không bật** (dành cho class DTO).
- Script `openapi:export` tạo app không `listen`, ghi `openapi/<module>.json` → CI artifact → mobile codegen.

## 7. Bảo mật

| NestJS cung cấp | C9 Map |
|---|---|
| Authentication chapter (JwtModule, Passport) | **Không** phát hành token. `AuthGuard` tự viết: `Reflector` + `IS_PUBLIC`, tách `Bearer`, `jose.jwtVerify` với JWKS Supabase |
| Authorization chapter (`RolesGuard`, CASL, `PoliciesGuard`) | Permission string `resource:action` + `PermissionGuard` + cache Redis; ownership kiểm trong service. Không CASL |
| `@nestjs/throttler` (`ThrottlerModule.forRoot`, `@Throttle`, `@SkipThrottle`, `getTracker`, storage) | Có, Redis storage (Lua, tự viết); bỏ qua `/health` và `/docs` bằng `skipIf`; tracker user → device → ip; Express `trust proxy` = 1 (nginx) |
| Helmet, CORS | `helmet()` trước mọi `app.use`; CORS chưa bật (mobile không cần), thêm khi có web admin |
| CSRF, cookie, session | Không — Bearer stateless |
| Encryption/hashing | Không lưu mật khẩu (Supabase); HMAC cho SĐT ở `public.*` nếu cần |

## 8. Techniques — dùng / tránh

| Chương | C9 Map | Vì sao |
|---|---|---|
| Configuration | `ConfigModule.forRoot({ isGlobal, cache, validationSchema: envSchema })`; env có kiểu đọc từ `config/env.ts` (không `registerAs` — YAGNI) | zod native, fail-fast lúc boot |
| Database | Không dùng TypeORM/Prisma module; `DatabaseModule` tự viết cung cấp Drizzle qua `useFactory` | Drizzle không có module chính thức |
| Caching (`CacheModule`, `CacheInterceptor`) | **Không** `CacheInterceptor` (cache theo URL, lộ dữ liệu theo user); `CacheService` mỏng trên ioredis với key `c9:v1:*` | Kiểm soát key/TTL/invalidate |
| Versioning | `VersioningType.URI`, `defaultVersion: '1'` → `/api/v1/...` | Đúng README |
| Task scheduling (`@nestjs/schedule`) | **NEVER** | `@Cron` chạy trên mọi replica |
| Queues (`@nestjs/bullmq`) | `BullModule.forRootAsync` (Redis DB 1), `registerQueue`, `@Processor` extends `WorkerHost`, `process(job)` switch theo `job.name`, `@OnWorkerEvent('failed')`, `defaultJobOptions { attempts: 3, backoff: exponential, removeOnComplete }` | Chuẩn docs |
| Logging | `nestjs-pino` thay `Logger` mặc định (`bufferLogs: true` + `app.useLogger(app.get(Logger))`) | JSON, redact, requestId |
| Events (`EventEmitterModule`) | Không cho logic liên instance; chỉ được dùng trong-process (không dùng ở gđ 1) | Không vượt qua instance |
| Compression | nginx | Không tốn CPU app |
| File upload (Multer) | Không — presigned R2 | File không đi qua backend |
| Streaming files | Không | Ảnh qua CDN |
| HTTP module (`@nestjs/axios`) | Có khi gọi FCM/payment, `timeout` bắt buộc | Chuẩn |
| Session, MVC, SSE, Cookies | Không | Stateless + polling |
| Performance (Fastify) | **Express** | Hệ sinh thái, nginx đã tối ưu; xem lại khi > 5k rps |
| Raw body | `rawBody: true` + `@Req() req: RawBodyRequest` | Webhook thanh toán ký HMAC |

## 9. Recipes & FAQ áp dụng

- **Terminus**: `HealthModule` với `DrizzleHealthIndicator`, `RedisHealthIndicator` (inject `HealthIndicatorService`); `/health/live` không check gì (trả `{ status, instance }`), `/health/ready` check DB + Redis.
- **Global prefix**: `setGlobalPrefix('api', { exclude: GLOBAL_PREFIX_EXCLUDE })` với dạng object `{ path: 'health/{*splat}', method }` (v12 dùng `{*splat}`, không phải `*`).
- **Keep-alive**: `httpAdapter.getHttpServer().keepAliveTimeout = 65_000` (> nginx `keepalive_timeout 60`); `headersTimeout = 66_000`.
- **REPL**: `nest start --entryFile repl` để gọi service tay khi debug.
- **AsyncLocalStorage / `nestjs-cls`**: chưa; `nestjs-pino` đã gắn requestId vào log; thêm khi cần truyền context sang job.
- **Hybrid app / microservices**: không.
- **Devtools**: bật `snapshot: true` chỉ local khi cần soi graph.
- **Route conflicts**: chưa bật `routeConflictPolicy`; hiện tránh bằng quy ước khai path tĩnh trước `:id`.

## 10. Testing (chương Fundamentals › Testing)

- Unit: `Test.createTestingModule({ providers })` + `overrideProvider` cho repository → chỉ test logic thuần (trust score, tier).
- Integration: PostGIS + Redis thật (testcontainers) — không mock DB.
- E2E: `moduleRef.createNestApplication()` với **đúng** enhancer toàn cục (nhờ token `APP_*`), supertest.
- Guard trong test: `overrideGuard(AuthGuard).useValue({ canActivate: ctx => { req.user = …; return true } })` cho test không cần Supabase; E2E auth riêng dùng Supabase local.

## 11. Gotchas phải nhớ

1. `app.useGlobalGuards()` không nhận DI và không override được trong test → luôn dùng `APP_GUARD`.
2. `app.use(mw)` không có DI → middleware class + `forRoutes('*')`.
3. Không bao giờ `Scope.REQUEST` — lan lên toàn cây.
4. `@Cron` × số replica; `EventEmitter` không qua instance; `CacheModule` mặc định in-memory.
5. Filter khớp đầu tiên thắng; đặt `@Catch()` cuối.
6. Interface không dùng làm token DI (bị xoá lúc runtime) → abstract class hoặc string token + `@Inject`.
7. Processor không đi qua pipe/guard → job data validate bằng zod thủ công trong `*.jobs.ts`.
8. Terminus v12: không extend `HealthIndicator`.
9. `setGlobalPrefix` exclude phải khớp chính xác; wildcard `*` trần bị cấm.
10. `keepAliveTimeout` phải > idle timeout của nginx, nếu không client thấy `ECONNRESET` ngẫu nhiên.
11. `@Optional()` không còn kế thừa từ lớp cha (v12).
12. Schema zod cho Swagger phải là **cùng object** dùng trong decorator; đừng tạo schema inline khác nhau giữa pipe và docs.

## 12. Skill `nestjs-best-practices` (40 rule) — áp dụng cho C9 Map

Skill viết cho stack TypeORM + class-validator + Passport + Jest + Terminus/BullMQ API cũ. Nguyên tắc thì đúng, ví dụ code thì **không** được sao chép nguyên. Bảng này là quyết định cuối; khi skill và bảng này khác nhau, **bảng này thắng**.

Ký hiệu: ✅ áp dụng nguyên · ⚠️ áp dụng nguyên tắc, đổi cách làm · ❌ không áp dụng

| Rule | Quyết định | Cách làm ở C9 Map |
|---|---|---|
| arch-feature-modules | ✅ | `modules/<nghiệp vụ>/` (code-standards §3) |
| arch-module-sharing | ✅ | Chỉ export service; `@Global()` cho Config/Database/Redis/Supabase/Auth |
| arch-single-responsibility | ✅ | Service < 200 dòng; SQL ở `<x>.repository.ts`, job ở `<x>.jobs.ts` |
| arch-avoid-circular-deps | ✅ | Không `forwardRef`; vòng = tách module thứ ba hoặc outbox |
| arch-use-repository-pattern | ✅ | `*.repository.ts` sở hữu Drizzle SQL; service không viết SQL |
| arch-use-events | ⚠️ | `EventEmitter2` chỉ cho side-effect **trong-process, mất được** (vd log audit). Việc phải xảy ra (rep, badge, push) → outbox → BullMQ vì đa instance |
| di-prefer-constructor-injection | ✅ | `private readonly` trong constructor; property inject chỉ với `@Optional()` |
| di-scope-awareness | ✅ | Chỉ singleton; cần request context → `nestjs-cls` (không `Scope.REQUEST`) |
| di-avoid-service-locator | ✅ | Không `ModuleRef.get` trong service; ngoại lệ factory theo `type` |
| di-use-interfaces-tokens | ✅ **mới** | Adapter ngoài sau Symbol token: `PUSH_SENDER`, `PAYMENT_GATEWAY`, `SMS_SENDER`, `OBJECT_STORAGE` (R2), `SUPABASE_ADMIN` |
| di-interface-segregation | ✅ **mới** | Mỗi token một interface nhỏ (`PushSender.send`, không "NotificationService" 8 method) |
| di-liskov-substitution | ✅ **mới** | Mock adapter (FCM/R2/payment) phải qua **cùng bộ contract test** với bản thật |
| error-use-exception-filters | ⚠️ | `AllExceptionsFilter` qua `APP_FILTER` (không `useGlobalFilters`); shape `{ success, code, msg, data, meta }` |
| error-throw-http-exceptions | ⚠️ | Service ném `AppException(ErrorCodes.X, params)`; không ném `NotFoundException('User #1 not found')` (không echo input, không câu tiếng Việt) |
| error-handle-async-errors | ⚠️ | Giữ: `.catch()` bắt buộc cho fire-and-forget (`touchDevice`), `process.on('unhandledRejection')` log; **bỏ** ví dụ `@Cron` |
| security-validate-all-input | ⚠️ | `StandardSchemaValidationPipe` + zod (không class-validator); zod `.strict()` thay `forbidNonWhitelisted` |
| security-auth-jwt | ❌ | Supabase phát token, NestJS verify JWKS; **không** roles trong JWT, không Passport, không refresh table |
| security-use-guards | ✅ | `AuthGuard` + `PermissionGuard` qua `APP_GUARD`, `@Public()` |
| security-rate-limiting | ✅ | Throttler Redis, `@Throttle` per route, `@SkipThrottle` health, tracker user→device→ip |
| security-sanitize-output | ✅ **mới** | Text người dùng (note pin, reply, display name) strip HTML bằng zod `.transform` trong contracts; lỗi không echo input; helmet |
| perf-async-hooks | ✅ | Kết nối trong `onModuleInit`, đóng trong `onModuleDestroy`; constructor không I/O |
| perf-use-caching | ⚠️ | Cache thủ công qua `CacheService` (ioredis), invalidate khi ghi; **không** `CacheModule`/`CacheInterceptor` |
| perf-optimize-database | ✅ | Drizzle `select` cột cần; index theo query; cursor pagination (không OFFSET) |
| perf-lazy-loading | ❌ | Monolith boot nhanh, không serverless |
| test-use-testing-module | ✅ | `Test.createTestingModule` + `overrideProvider` cho repository/token trong unit test |
| test-e2e-supertest | ⚠️ | Supertest với enhancer thật (nhờ `APP_*`); DB thật qua testcontainers, không `synchronize` |
| test-mock-external-services | ⚠️ | Mock **adapter ngoài** (FCM, R2, payment, Supabase admin) qua token; **không** mock PostGIS/Redis ở integration; `vi.useFakeTimers` cho test hết hạn |
| db-use-transactions | ✅ | `db.transaction(tx => …)`; outbox ghi cùng `tx` |
| db-avoid-n-plus-one | ✅ | Một query/list endpoint: join hoặc `inArray` batch; bật log query ở dev để bắt N+1 |
| db-use-migrations | ✅ | `drizzle-kit generate` → review → `migrate` bước riêng; không `push` ở prod |
| api-use-dto-serialization | ⚠️ | Không class-transformer. Nguyên tắc giữ: **không trả raw row** — service map sang `ResponseSchema` zod trong contracts |
| api-use-interceptors | ✅ | Bọc `{ success, code, msg, data, meta }`; cân nhắc `TimeoutInterceptor` 15 s cho route ngoài health |
| api-use-pipes | ⚠️ | Không `ParseUUIDPipe`/`DefaultValuePipe`; zod `z.uuid()`, `.default()`, `z.coerce` làm việc đó |
| api-versioning | ✅ | `VersioningType.URI`, `defaultVersion: '1'` |
| micro-use-patterns | ❌ | Không microservices |
| micro-use-health-checks | ⚠️ | Nguyên tắc giữ (live/ready, 503 khi đang shutdown); **API Terminus 12** `HealthIndicatorService`, không `HealthIndicator`/`HealthCheckError` |
| micro-use-queues | ⚠️ | `@nestjs/bullmq` 12: `WorkerHost.process()`, `@OnWorkerEvent`, `upsertJobScheduler` — **không** `@Process`, `@OnQueueActive`, `repeat:{cron}` của skill |
| devops-use-config-module | ⚠️ | `validationSchema` = zod (không Joi); env có kiểu từ `config/env.ts`, không `registerAs` |
| devops-use-logging | ✅ | `nestjs-pino` redact, requestId; không `console.log` |
| devops-graceful-shutdown | ⚠️ | `enableShutdownHooks()` đủ, không tự `process.on(SIGTERM)`; thêm readiness 503 khi shutdown + `stop_grace_period` |

**Bổ sung vào quy chuẩn code từ skill:** xem [code-standards.md §2.7](./code-standards.md).
