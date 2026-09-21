# NestJS Overview & Fundamentals: c9_map Architecture Report

## Overview Section

### First Steps
- `NestFactory.create()` returns `INestApplication` (or typed `NestExpressApplication`); bootstrap via async function
- Module-based organization: one directory per feature module
- **c9_map uses:** Module structure for domain-driven design; avoids monolithic bootstrap setup

### Controllers  
- `@Controller(path)` with `@Get/@Post/@Put/@Delete` + param decorators (`@Param/@Query/@Body/@Headers/@Ip`)
- Route conflicts resolved via `routeConflictPolicy` in v12; `routeResolutionStrategy: 'specificity'` prevents parametric shadowing
- **c9_map uses:** Clean request mapping; avoids library-specific `@Res()` response handling (use direct returns for interceptor access)

### Providers
- `@Injectable()` services resolved via TypeScript type hints; constructor injection preferred over `@Inject()` property decoration
- Only classes work as DI tokens at runtime (interfaces erased by TypeScript)
- **c9_map uses:** Service-based business logic; avoids interfaces as DI tokens (use abstract classes or string tokens)

### Modules
- `@Module({ providers, controllers, imports, exports })` encapsulates by default; `@Global()` makes exports universally available
- `forRoot()`/`forRootAsync()` patterns for dynamic configuration; async waits for Promise resolution before instantiation
- **c9_map uses:** Feature modules with centralized `AppModule` importing all domains; exports shared services for auth/permissions

### Middleware
- Implements `NestMiddleware` + `@Injectable()` or functional middleware (preferred for no-DI scenarios)
- Configured via `NestModule.configure(consumer: MiddlewareConsumer)` with `.apply(mw).forRoutes('*')` for global; runs before route handlers
- Global middleware via `app.use()` in main.ts cannot access DI (use `forRoutes('*')` instead)
- **c9_map uses:** Request-ID propagation middleware via `forRoutes('*')` to inject context; avoids global `app.use()` for dependency needs

### Exception Filters
- `@Catch(ExceptionType)` implements `ExceptionFilter<T>` with `catch(exception, host: ArgumentsHost)` method
- Three scopes: method (`@UseFilters()`), controller class, global (`APP_FILTER` token in `@Module` providers)
- `host.switchToHttp().getResponse()` for manual response; default format: `{statusCode, message, errorCode?}`
- **c9_map uses:** Global `APP_FILTER` for `{error:{code,params,requestId}}` format via custom HttpExceptionFilter; handles all exceptions uniformly

### Pipes
- Implements `PipeTransform<T,R>` with `transform(value, metadata: ArgumentMetadata)` for validation/transformation
- Two patterns: validation (throw `BadRequestException` or pass through) + transformation (return modified value)
- Global via `APP_PIPE` token (recommended, enables DI) or `app.useGlobalPipes()` in bootstrap
- **c9_map uses:** Zod validation pipe globally for DTO transformation; set `skipMissingProperties: false` to validate body completeness

### Guards
- Implements `CanActivate` returning `boolean | Promise<boolean> | Observable<boolean>`; runs after middleware, before interceptors/pipes
- Three scopes: method (`@UseGuards`), controller, global (`APP_GUARD` token)
- Use `Reflector.getAllAndOverride(metaKey, [handler, class])` to retrieve role/permission metadata from `SetMetadata`
- **c9_map uses:** Global AuthGuard + PermissionsGuard via `APP_GUARD`; must bypass OPTIONS requests; use Reflector to check `@Permissions('resource:action')`

### Interceptors
- Implements `NestInterceptor` returning Observable via `intercept(ctx, next: CallHandler)` with RxJS operators
- Three scopes: method, controller, global (`APP_INTERCEPTOR` token)
- Common patterns: `tap()` for logging, `map()` for response transformation, `catchError()` for error override
- **c9_map uses:** Avoid response body wrapping (breaks pagination); use for error context enrichment (add request ID to error response)

### Custom Decorators
- `createParamDecorator((data, ctx) => {...})` for custom `@Param`-like decorators extracting request properties
- `applyDecorators(SetMetadata(...), UseGuards(...))` for decorator composition
- `Reflector.createDecorator()` + `Reflector.getAllAndOverride(key, [handler, class])` for guard/interceptor metadata access
- **c9_map uses:** `@Permissions(perms)` + `@RequestId()` custom decorators; avoid over-composition to prevent guard/pipe conflicts

---

## Fundamentals Section

### Custom Providers
- `useValue` (constants), `useClass` (conditionally instantiated), `useFactory` (sync/async factory), `useExisting` (aliases)
- Non-class tokens require `@Inject(tokenStr)` in constructors; abstract classes work without `@Inject()`
- Optional dependencies: `{ token: 'NAME', optional: true }` resolves to `undefined` if unavailable
- **c9_map uses:** Custom `useFactory` for DB connection pooling; avoids `useValue` for mutable config (risks state sharing across instances)

### Asynchronous Providers
- `useFactory: async () => {...}` returns Promise; NestJS blocks dependent class instantiation until resolved
- Enables DB/service initialization before app accepts requests
- **c9_map uses:** Async DB connection in `forRootAsync()` pattern; auto-waits during bootstrap

### Dynamic Modules
- `DynamicModule` interface: standard module + `module` property identifying the class
- Three conventional methods: `register()` (per-import config), `forRoot()` (app-wide), `forFeature()` (sub-config for root)
- `ConfigurableModuleBuilder` auto-generates async counterparts; use `setExtras()` for module-level config (e.g., `isGlobal`)
- **c9_map uses:** `forRoot(dbConfig)` for single DB instance across all modules; `@Global() + exports` to avoid repeated imports

### Injection Scopes
- `Scope.DEFAULT` (singleton, shared across app), `Scope.REQUEST` (new per HTTP request), `Scope.TRANSIENT` (new per injection)
- Request scope "bubbles up": if service depends on request-scoped provider, service becomes request-scoped
- Transient breaks bubble: singleton can inject transient without becoming request-scoped
- ~5% latency cost for request scope; avoid unless necessary
- **c9_map uses:** Singleton for guards/services; avoid REQUEST scope (stateless instances—no per-request state to retain)

### Circular Dependency
- Detected at runtime; resolved via `forwardRef(() => ServiceName)` on both sides
- Alternative: use `ModuleRef.get()` to break cycle at runtime
- **Critical:** "Order of instantiation indeterminate"—don't rely on constructor call order
- Avoid barrel imports (index.ts) in same directory; can inadvertently create cycles
- **c9_map uses:** Prefer forward refs over ModuleRef for static deps; use ModuleRef only for lazy/conditional access

### Module Reference
- `ModuleRef.get(token, {strict: false})` retrieves singleton providers; returns cached instance
- `ModuleRef.resolve(token)` dynamically instantiates scoped providers (transient/request) as Promise
- `ContextIdFactory.create()` + `registerRequestByContextId()` for custom request context tracking
- **c9_map uses:** `get()` in interceptors for error enrichment services; avoid `resolve()` (expensive, defeats singleton efficiency)

### Lazy-Loading Modules
- `LazyModuleLoader.load(() => LazyModule)` defers module initialization; cached on first load (~2.3ms → ~0.3ms subsequent)
- Controllers/resolvers, lifecycle hooks, global enhancers **cannot** be lazy-loaded
- **c9_map uses:** Avoids lazy loading (monolith bootstrap time negligible; workers/lambdas don't apply)

### Execution Context
- `ArgumentsHost` (base) → `ExecutionContext` (extends with handler/class info)
- `ctx.switchToHttp()` returns `HttpArgumentsHost` with `.getRequest()`, `.getResponse()`
- `ctx.getHandler()` retrieves handler method reference for metadata lookup via `Reflector`
- **c9_map uses:** Custom request ID middleware leverages context to attach to request object; guards extract via `switchToHttp().getRequest()`

### Lifecycle Events
- **Init phase:** `onModuleInit()` (deps resolved) → `onApplicationBootstrap()` (before listen)
- **Termination phase:** `onModuleDestroy()` → `beforeApplicationShutdown()` → `onApplicationShutdown()` (post-close)
- Execution order depends on module import order; must explicitly call `app.enableShutdownHooks()`
- Request-scoped classes skip all lifecycle hooks
- **c9_map uses:** `onApplicationBootstrap()` for health check setup; avoids shutdown hooks (stateless nodes—no cleanup needed)

### Platform Agnosticism
- Supports Express (default) + Fastify; "build once, use everywhere" via `NestFactory.create<NestExpressApplication>()`
- Controllers, services, guards, pipes reusable across HTTP/microservices/WebSocket transports
- **c9_map uses:** Express default; avoids platform-specific code in services/guards

### Testing
- `Test.createTestingModule({ controllers, providers, imports }).compile()` for unit tests
- `.createNestApplication()` for e2e with full runtime
- Override providers via `overrideProvider(token).useValue/useClass/useFactory()`; for global enhancers, change to `useExisting`
- Use `ContextIdFactory.create()` + spy on `getByRequest()` for request-scoped instance testing
- **c9_map uses:** `Test.createTestingModule()` with mock guards/pipes; override global filters in test setup via `APP_FILTER` token

### Discovery Service
- `DiscoveryService.getProviders()`, `.getControllers()`, `.getMetadataByDecorator(DecoratorKey, item)`
- Enables runtime introspection for plugin registration, feature flags, auto-wiring
- Requires `DiscoveryModule` import
- **c9_map uses:** Auto-discovery for `@Permissions` decorated endpoints in logging/audit middleware; avoids manual route registration

---

## Gotchas

1. **APP_* tokens must be in providers array, not bootstrap:** Registering global enhancers via `app.useGlobalFilters/Guards/Pipes/Interceptors()` prevents override in tests; use `APP_FILTER/APP_GUARD/APP_PIPE/APP_INTERCEPTOR` tokens in `@Module()` instead.

2. **Global middleware cannot access DI:** Use `forRoutes('*')` with class middleware or functional wrapper, not `app.use()`, if you need service injection (e.g., request ID logger).

3. **Request scope bubbles up the chain:** If a request-scoped provider is injected anywhere, all dependents become request-scoped—perf penalty cascades; audit dependency trees before using REQUEST scope.

4. **Exception filter execution halts after first match:** Only the first filter matching the exception type executes; a catch-all filter (`@Catch()`) at the end will never run if specific filters precede it.

5. **Pipes run after guards but before interceptors:** Validation failure throws before handler + interceptors; verify guard logic doesn't depend on validated body shape.

6. **Circular dependencies with REQUEST scope = undefined:** If two services depend on each other and either is REQUEST-scoped, instantiation fails silently; always use singleton for circular services.

7. **Interfaces erase at runtime—use abstract classes for DI:** Constructor injection of interface types fails because TypeScript strips them; use abstract classes or string tokens with `@Inject()`.

8. **ModuleRef.resolve() is expensive:** Each call instantiates transient/request-scoped providers; cache results or use singleton providers accessed via `get()` instead.

9. **DiscoveryService requires DiscoveryModule import:** Injecting it without importing the module throws "Provider not found"; must import in app or feature module first.

10. **Reflector.getAllAndOverride searches handler then controller:** Metadata attached via `SetMetadata` at method level overrides class-level metadata; verify decorator scope when building permission checks.

---

## Recommended Module Skeleton Conventions

```typescript
// src/domains/{domain}/{domain}.module.ts
import { Global, Module } from '@nestjs/common';
import { {Domain}Controller } from './{domain}.controller';
import { {Domain}Service } from './{domain}.service';

@Global() // Omit for feature modules without shared exports
@Module({
  controllers: [{Domain}Controller],
  providers: [{Domain}Service],
  exports: [{Domain}Service], // Only services shared cross-domain
  imports: [], // External/feature module dependencies
})
export class {Domain}Module {}

// app.module.ts: Register APP_* tokens here, then feature modules
@Module({
  imports: [AuthModule, PermissionsModule, ...allDomainModules],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}

// main.ts: Middleware only, no global enhancers
app.use(requestIdMiddleware);
app.enableShutdownHooks(); // Only if cleanup needed
```

---

**Report generated:** 2026-09-16  
**NestJS version:** 12 (docs.nestjs.com as of Sept 2026)  
**Scope:** Modular-monolith API with global guard/filter/pipe pattern, request-ID propagation, Zod validation, multiple stateless instances
