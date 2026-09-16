# NestJS v12 Documentation: CLI, Recipes, FAQ, Devtools Research

**Date:** 2026-09-16 | **Sources:** docs.nestjs.com v12, raw GitHub markdown

---

## CLI & Workspaces

**Facts:** (1) Monorepo mode activated via `nest g app <name>` (creates `/apps`); `nest g library <name>` creates reusable packages. (2) `nest-cli.json` keys: `"monorepo": true`, `"root": "apps/default"`, `"sourceRoot": "apps/default/src"`, `"projects": {...}`. (3) Default builder v12 is **Rspack** (webpack deprecated); SWC builder ~20x faster with `--type-check` for TypeScript validation. (4) `nest start --watch --debug` for dev; `nest build --parallel [N]` for concurrent builds. (5) Node.js: v20.11+ runtime, v22.22.3+/v24.15+/v26+ for CLI scaffolding.

**c9_map:** Use Nest CLI monorepo mode for separating api/worker apps under `apps/`, shared `libs/contracts` for Zod schemas.

---

## Recipes: Development & Infrastructure

**REPL:** (1) `npm run start -- --entryFile repl` launches interactive terminal. (2) Commands: `get(Service)`, `methods(Class)`, `debug()` (dump modules), `resolve()` (transient scopes). (3) Watch mode: `npm run start -- --watch --entryFile repl` with `.nestjs_repl_history`.

**c9_map:** Use REPL for quick provider debugging during development without HTTP restart.

**SWC Builder:** (1) Install: `npm i --save-dev @swc/cli @swc/core`. (2) Config: `"compilerOptions": { "builder": "swc", "typeCheck": true }`. (3) Advanced: `"builder": { "type": "swc", "options": { "swcrcPath": "infra/.swcrc" } }`.

**c9_map:** Enable SWC for faster dev iterations; use `typeCheck: true` to catch errors without separate tsc run.

**CRUD Generator:** (1) `nest g resource <name>` auto-creates module, service, controller/resolver, DTO, entity, specs. (2) Supports: HTTP controllers, GraphQL (code/schema-first), microservices, WebSockets. (3) Flag: `--no-spec` to skip tests.

**c9_map:** Use for rapid API scaffolding; skip `--spec` in initial setup, add tests post-generation.

**Terminus Health Checks:** (1) `HealthCheckService` + `HealthIndicatorService` pattern; built-in: `HttpHealthIndicator`, `TypeOrmHealthIndicator`, `DiskHealthIndicator`, `MemoryHealthIndicator`. (2) Controller: `@Controller('health')` with `@HealthCheck()` decorator, `check([indicatorFn])`. (3) Custom indicator: extend `HealthIndicatorService`, `.attempt()`, `.withTimeout()`, `.cacheFor()`.

**c9_map:** Implement `/health` for multi-instance behind nginx; cache checks to avoid cascade failures.

**RouterModule:** (1) `RouterModule.register([{ path: 'api', module: ApiModule }])` prefixes all module routes. (2) Hierarchical: `children: [{ path: 'v1', module: V1Module }]` nests paths. (3) Import in root, not per-module.

**c9_map:** Use RouterModule for `/api/v1` prefix hierarchy across versioned endpoints.

**AsyncLocalStorage (ClsModule):** (1) Wrap requests: `cls.run({}, () => next())` or use `@nestjs/cls` package. (2) Set context in middleware/controller: `cls.set('userId', req.headers['x-user-id'])`. (3) Access anywhere downstream via `cls.get('key')` without parameter threading.

**c9_map:** Inject ClsService to pass request context (user, correlation ID) to worker tasks without function params.

---

## FAQ: Deployment & Configuration

**Request Lifecycle Order:** Middleware → Guards → Interceptors (pre) → Pipes → Controller → Service → Interceptors (post) → Exception Filters → Response.

**c9_map:** Use guards/interceptors for auth, pipes for validation; intercept exceptions before 500 responses.

**Global Prefix:** (1) `app.setGlobalPrefix('v1')` applies to all routes. (2) Exclude: `{ exclude: [{ path: 'health', method: RequestMethod.GET }] }` or `exclude: ['cats']`. (3) Wildcards: no `*`, use `:param` or `*splat`.

**c9_map:** Prefix all API routes with `v1`; exclude `/health`, `/metrics` for nginx checks.

**Raw Body (Webhooks):** (1) Enable in `NestFactory.create()`: `{ rawBody: true }` (Express/Fastify). (2) Access: `@Req() req: RawBodyRequest<Request>` → `req.rawBody` (Buffer). (3) Default limits: 100kb (Express), 1MiB (Fastify); adjust via `.useBodyParser()`.

**c9_map:** Enable for payment webhooks (Sepay signature verification); buffer access for HMAC validation.

**Keep-Alive & Load Balancers:** (1) `forceCloseConnections: true` forces immediate shutdown; useful with `--watch`. (2) Set `server.keepAliveTimeout` **>** load-balancer idle timeout to prevent premature closes. (3) Most apps don't need this unless using `enableShutdownHooks()`.

**c9_map:** Use `forceCloseConnections: true` in dev; in production behind nginx, set keepAliveTimeout > nginx idle (~65s).

**Hybrid Applications:** (1) `app.connectMicroservice()` attaches non-HTTP transports (TCP, Redis, NATS). (2) `@MessagePattern()` targets specific transports. (3) `inheritAppConfig: true` copies pipes/guards to microservices. (4) Start HTTP before calling `app.startAllMicroservices()`.

**c9_map:** Connect microservice for worker queue (Redis) while HTTP API runs; enable inheritAppConfig for consistent middleware.

**Multiple Servers:** (1) HTTPS: pass `httpsOptions` to `NestFactory.create()`. (2) HTTP + HTTPS simultaneously: use `ExpressAdapter` with manual `http.createServer()` + `https.createServer()`. (3) Implement `OnApplicationShutdown` to close manual servers; NestJS won't auto-close them.

**c9_map:** Keep HTTP-only behind nginx (handles SSL termination); skip manual HTTPS setup.

**Common Errors:** (1) "Cannot resolve dependency" → check provider is in `providers` array, not `imports`. (2) Monorepo duplicate `@nestjs/core` → use `nohoist: ["@nestjs/core"]` (Yarn) or peerDependency + injected (pnpm). (3) Circular deps → apply `forwardRef()` to modules/providers.

**c9_map:** Verify shared lib's `contracts` exports from package.json root, not nested; avoid circular deps via barrel files.

---

## Standalone Applications & Workers

**Facts:** (1) `NestFactory.createApplicationContext(AppModule)` creates IoC container without HTTP listeners. (2) Access providers: `app.get(Service)` (static) or `app.select(DynamicModule).get(Service)`. (3) Terminate: `await app.close()` triggers lifecycle hooks. (4) **No HTTP features**: middleware, interceptors, pipes, guards unavailable; request-scoped context doesn't apply.

**c9_map:** Use in `APP_ROLE=worker`: `createApplicationContext` for background tasks; inject `app.init()` equivalent via module initialization lifecycle; call `app.close()` on SIGTERM for graceful shutdown.

---

## Devtools

**Facts:** (1) Enable: `NestFactory.create({ snapshot: true })`, install `@nestjs/devtools-integration`, import `DevtoolsModule` with `http: true`. (2) Features: dependency graph visualization (modules/providers/routes), routes explorer with execution flow, bootstrap analyzer (instantiation times for serverless), audit page (architecture linter). (3) Debugging: partial graph in `graph.json` on failed bootstrap shows exact module with missing dependency. (4) Playground: test routes without auth.

**c9_map:** Enable in dev to visualize app → api module graph; use audit page to catch oversized services before prod.

---

## Migration Guide: v11 → v12 Breaking Changes

**Facts:** (1) **Webpack deprecated** → Rspack is default; migrate `--webpack` to `--builder rspack` (or `tsc`, `swc`). (2) **ESM-only packages** → all `@nestjs/*` now ESM; requires Node 20.19+ / 22.12+; `tsconfig.json`: `"module": "nodenext"`, `"moduleResolution": "nodenext"`, `package.json`: `"type": "module"`. (3) **nest-cli.json changes:** `includeLibraryAssets` property added for copying assets from libs. (4) **CLI generation requires** Node 22.22.3+, 24.15+, or 26+. (5) **Schematic decorators** now use `Reflector.createDecorator()`.

**c9_map:** Update `tsconfig` to nodenext; confirm Rspack config (or use tsc); ensure Node 22+ for CLI, 20+ for runtime.

---

## Decision: Project Layout for c9_map

**Recommendation: Nest CLI Monorepo Mode**

**Pros:**
- Native `nest-cli.json` orchestration (`monorepo: true`, `projects: {...}`)
- Single `nest start api` vs `nest start worker` without npm workspace context
- Built-in `nest g app` / `nest g library` tooling
- Shared lib (contracts) auto-resolved via `tsconfig.json` paths
- Easier migration path for future Nest upgrades

**Cons:**
- Lock into Nest CLI for tooling; harder to use other build systems
- Shared lib (`packages/contracts`) requires separate npm publish for mobile repo (not auto-exported to npm)

**Concrete Folder Tree:**
```
c9_map/
├── apps/
│   ├── api/              (nest g app api)
│   │   └── src/main.ts
│   └── worker/           (nest g app worker)
│       └── src/main.ts
├── libs/
│   └── contracts/        (nest g library contracts)
│       └── src/index.ts  (export Zod schemas)
├── nest-cli.json
│   { "monorepo": true, "root": "apps/api", 
│     "projects": { "api": {...}, "worker": {...}, "contracts": {...} } }
└── package.json
```

**Mobile Repo Integration:** Build `libs/contracts` as separate NPM package; CI/CD publishes to private registry for mobile consumption. Alternatively, use `npm link` locally or Git submodule for schemas.

---

## Gotchas

1. **Monorepo duplicate @nestjs/core** – In Yarn workspaces, use `nohoist: ["@nestjs/core"]` in root `package.json`; pnpm requires `"injected": true` + peerDependency declaration.

2. **SWC without typeCheck** – SWC transpiles only, doesn't validate types; add `"typeCheck": true` to `nest-cli.json` for type safety; else catch errors at runtime.

3. **Webpack HMR deprecated in v12** – Hot reload now via Rspack; old `webpack-hmr.config.js` won't work; either remove HMR or migrate to Rspack.

4. **forceCloseConnections with persistent connections** – Setting to `true` force-closes sockets mid-request; use only in dev/watch mode, not production with long-lived connections (WebSockets).

5. **SharedModule confusion** – Libs/shared must be in `imports`, not `providers`; `@nestjs/common` utilities (guards, pipes) go in `providers` of consuming module.

6. **createApplicationContext lacks HTTP features** – Worker code can't use middleware, pipes, guards directly; manually call validation/auth logic; no `REQUEST` token.

7. **Global prefix excludes must match exactly** – String `'health'` excludes all methods; use `{ path: 'health', method: GET }` for fine-grained control; wildcards require `:param` syntax.

8. **Keep-alive timeout > LB idle timeout** – If server timeout ≤ LB idle, LB closes first, causing client-side "connection reset" errors; set `server.keepAliveTimeout = 65000` (>nginx ~60s idle).

9. **AsyncLocalStorage context lost in async spawns** – ClsModule context doesn't propagate to `setTimeout`, child processes, or detached async tasks; wrap manually or use `AsyncResource.bind()`.

10. **RouteModule imports in leaf modules** – RouterModule must be imported in the **module that owns controllers**, not parent; child prefixes don't apply if parent omits it.
