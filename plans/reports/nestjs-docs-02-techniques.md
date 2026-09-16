# NestJS 12 Techniques: c9_map Applied Reference

## 1. Configuration
[Docs](https://docs.nestjs.com/techniques/configuration)
- `ConfigModule.forRoot({ validate, cache, isGlobal })` – load env, validate schema via zod/valibot, cache `process.env` access, register globally
- `validate()` function receives string vars; use `z.coerce.number()` for type coercion
- `registerAs()` for namespaced configs in feature modules
- **c9_map uses**: `@nestjs/config` with zod validation, `cache: true`, `isGlobal: true` because all replicas read same env vars

## 2. Database
[Docs](https://docs.nestjs.com/techniques/database)
- TypeORM, Sequelize, MikroORM, Prisma mentioned; async setup via `forRootAsync()`, inject dependencies
- No guidance on Drizzle; NestJS omits this choice
- **c9_map uses**: Drizzle directly (no module) because it's lightweight, stateless-friendly, and no ORM-lock-in needed

## 3. Validation
[Docs](https://docs.nestjs.com/techniques/validation)
- `ValidationPipe` (class-validator decorators) vs `StandardSchemaValidationPipe` (zod/valibot/ArkType schema-first)
- `whitelist: true, forbidNonWhitelisted: true, transform: true` for strict DTO coercion
- No class-validator required for schema-first approach
- **c9_map uses**: `StandardSchemaValidationPipe` with zod, avoiding class-validator decorator burden

## 4. Caching
[Docs](https://docs.nestjs.com/techniques/caching)
- `CacheModule.register()` defaults to in-memory; Redis via `@keyv/redis`
- `CacheInterceptor` auto-caches `GET` responses; respects `@CacheTTL(ms)`
- **Pitfall**: Unsuitable for per-user data, GraphQL per-field resolvers, endpoints with `@Res()`, incompatible with unstructured-clone types
- **c9_map uses**: `@nestjs/cache-manager` with custom ioredis provider (not Keyv) for cross-instance cache; avoid `CacheInterceptor` for user-scoped data

## 5. Serialization
[Docs](https://docs.nestjs.com/techniques/serialization)
- `ClassSerializerInterceptor` + class-transformer: `@Exclude()`, `@Expose()`, `@Transform()` on DTOs
- Returns plain objects, not class instances → no serialization
- `@SerializeOptions({ type: EntityClass })` forces type coercion
- **c9_map avoids**: Serialization (stateless API; clients handle DTO transforms)

## 6. Versioning
[Docs](https://docs.nestjs.com/techniques/versioning)
- `app.enableVersioning({ type: VersioningType.URI })` → `/v1/route`, `/v2/route`
- `@Version('1')` on routes or `@Controller({ version: '1' })`
- `VERSION_NEUTRAL` resources ignore version; version mismatch → 404
- **c9_map uses**: `VersioningType.URI`, `/api/v1/` prefix for API routes

## 7. Task Scheduling
[Docs](https://docs.nestjs.com/techniques/task-scheduling)
- `@nestjs/schedule`: `@Cron(pattern)`, `@Interval(ms)`, `@Timeout(ms)` decorators
- Auto-wrapped try-catch, `SchedulerRegistry` for dynamic control, `waitForCompletion` option
- **Critical gotcha**: Cron jobs run on every replica independently → multiplied execution
- **c9_map avoids**: `@nestjs/schedule` entirely; use Redis-backed BullMQ for distributed scheduling

## 8. Queues
[Docs](https://docs.nestjs.com/techniques/queues)
- `@nestjs/bullmq`: `BullModule.forRoot()`, `registerQueue()`, `@Processor('name')` extends `WorkerHost`
- `process(job)` method called per job; use switch cases for job-type routing (no `@Process()`)
- `@OnWorkerEvent('active'), @QueueEventsListener()` for events
- `defaultJobOptions` (retries, backoff, attempts) on queue
- **c9_map uses**: `@nestjs/bullmq` with Redis, `defaultJobOptions` for retry/backoff resilience

## 9. Logging
[Docs](https://docs.nestjs.com/techniques/logger)
- `Logger` class from `@nestjs/common`; methods: `log()`, `error()`, `warn()`, `debug()`, `verbose()`, `fatal()`
- Custom `LoggerService` interface via dependency injection or `app.useLogger()`
- `ConsoleLogger({ json: true, logLevels, timestamp })` for structured logging
- `logger: ['error', 'warn']` in `NestFactory.create()` to filter levels
- **c9_map uses**: nestjs-pino adapter for structured JSON logging (not built-in ConsoleLogger)

## 10. Cookies
[Docs](https://docs.nestjs.com/techniques/cookies)
- Express: `cookie-parser` middleware, `req.cookies`, `req.signedCookies` (with `secret`)
- Fastify: `@fastify/cookie`, `request.cookies`
- Signed cookies prefixed `s:`, tamper-detection via `secret`
- **c9_map avoids**: No cookies; stateless API uses Bearer tokens only

## 11. Events
[Docs](https://docs.nestjs.com/techniques/events)
- `EventEmitterModule.forRoot()`, inject `EventEmitter2`, `emit('event.name', payload)`
- `@OnEvent('order.*', { async: true })` with wildcard patterns
- **Critical**: In-process only, not cross-instance; listeners must be application-scoped
- **c9_map avoids**: Local event emitter for cross-instance logic; use Redis pub/sub or queue events instead

## 12. Compression
[Docs](https://docs.nestjs.com/techniques/compression)
- Express: `compression()` middleware; Fastify: `@fastify/compress`
- Brotli `BROTLI_PARAM_QUALITY` (0–11 tradeoff: quality vs speed)
- Best offloaded to reverse proxy (nginx) in production
- **c9_map uses**: Nginx compression; avoid app-level gzip for load distribution

## 13. File Upload
[Docs](https://docs.nestjs.com/techniques/file-upload)
- `@UseInterceptors(FileInterceptor('field'))`, `@UploadedFile()`, `ParseFilePipe` validators
- `MulterModule.register({ dest, limits })`, `registerAsync()` for dynamic config
- **Limitation**: Incompatible with FastifyAdapter; no multipart support
- **c9_map avoids**: Multer; use cloud storage (S3/GCS) with pre-signed URLs instead

## 14. Streaming Files
[Docs](https://docs.nestjs.com/techniques/streaming-files)
- `StreamableFile` wraps Buffer or Stream; framework handles piping
- Supports both Express and Fastify transparently
- Custom MIME type via `type` option, `disposition` for attachment headers
- **c9_map uses**: `StreamableFile` for large file downloads; avoids manual piping

## 15. HTTP Module
[Docs](https://docs.nestjs.com/techniques/http-module)
- `@nestjs/axios`: wraps Axios, returns Observables; `HttpService.get/post(url)`
- `HttpModule.register({ timeout, maxRedirects })`, `registerAsync()` for async config
- `HttpService#axiosRef` for advanced usage; `firstValueFrom` + `catchError` for RxJS conversion
- **c9_map uses**: HttpModule with timeout config for external service calls

## 16. Sessions (Limited)
[Docs](https://docs.nestjs.com/techniques/sessions)
- Session store setup, cookies auto-sent per request
- **c9_map avoids**: No sessions; stateless auth via Bearer JWT

## 17. Model-View-Controller
[Docs](https://docs.nestjs.com/techniques/mvc)
- `@Render('template')` decorator, `app.setViewEngine('hbs')`, `app.useStaticAssets()`
- Template engine (hbs, ejs, pug); return data object passed to view
- Dynamic rendering via `@Res() res.render()`
- **c9_map avoids**: MVC; pure REST API (no server-side rendering)

## 18. Performance: Fastify vs Express
[Docs](https://docs.nestjs.com/techniques/performance)
- Fastify ~2x faster benchmarks; Express default due to ecosystem size
- Setup: `npm i @nestjs/platform-fastify`, `NestFastifyApplication`, listen on `0.0.0.0` not `127.0.0.1`
- Middleware incompatibilities: Express-style functions require middie package; no direct equivalents for some packages
- Fastify built-in compression, cookie, multipart support (but less mature)

## 19. Server-Sent Events
[Docs](https://docs.nestjs.com/techniques/server-sent-events)
- `@Sse('path')` returns `Observable<MessageEvent>`; browser `EventSource` API consumes stream
- Unidirectional server→client; persistent HTTP connection
- Cleanup via `@SseSignal()` AbortSignal on client disconnect
- **c9_map avoids**: SSE; stateless replicas can't maintain persistent streams; use WebSocket or polling instead

---

## Multi-Instance Gotchas

1. **Cron duplication** – `@nestjs/schedule` runs on every replica; multiply execution by instance count
2. **In-memory cache** – CacheModule defaults to `memory` store; cache hits non-uniform across replicas
3. **Event emitter not distributed** – `EventEmitterModule` local only; events don't cross instance boundaries
4. **Sticky sessions required** – Sessions require client affinity; breaks load-balancer assumptions
5. **Scheduled job race conditions** – Multiple replicas compete for same job without coordination
6. **Cache invalidation lag** – Redis cache updates may take time to propagate; stale reads possible
7. **File upload local storage** – Multer writes to instance disk; files invisible to other replicas
8. **Built-in caching unsuitable for per-user data** – CacheInterceptor caches globally; leaks user context across requests
9. **Logging context loss** – Structured logs must include request ID to correlate across replicas
10. **Microservice transport collision** – Multiple instances may bind same TCP port if not configured per-instance

---

## Decision: Express vs Fastify for c9_map

**Recommendation: Stay with Express.**

Rationale:
- **Ecosystem**: Massive middleware library, proven battle-hardened, easier debugging
- **Stability**: c9_map is a modular monolith, not a high-frequency streaming service; 2x speed gain unnecessary
- **Compatibility**: Multer (file upload) blocks Fastify; middleware ecosystem fragmented
- **Devops simplicity**: Express + nginx reverse-proxy compression standard in industry
- **Migration risk**: Switching platforms mid-project adds complexity for minimal throughput gain in your use case
- **Clustering model**: Multiple stateless instances already scale horizontally; CPU/latency not bottleneck yet

If benchmarking proves P99 latency or throughput is limiting (>5000 rps), revisit Fastify. Until then: Express + load balancer solves scaling.

---

**Unresolved questions:**
- Drizzle ORM best practices with NestJS (docs omit; not covered by official module)
- Logging: Does `nestjs-pino` integrate cleanly with `ConfigModule.validate`?
- Session: When IS stateful session justified in NestJS? (Docs assume JWT/bearer only)
