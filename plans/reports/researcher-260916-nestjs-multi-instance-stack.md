# NestJS 11 Modular Monolith Stack Research (Sept 2026)

**Date**: 2026-09-16 | **Sources**: npm, GitHub, NestJS docs

## Executive Summary

NestJS 12.x (evolved from 11.x) now stable with Node 20 LTS (v20.19+) or v22 LTS. Stack uses ioredis (required for BullMQ), postgres.js driver (prepared statements by default; disable in AWS), and Drizzle 0.45.2 with native geometry support. Rspack now default bundler for monorepos. Rate limiting via @nestjs/throttler v6 + Redis storage proven production-ready.

---

## Recommended Package List for c9_map

| Package | Version | Purpose |
|---------|---------|---------|
| @nestjs/core | 12.0.3 | NestJS framework core |
| @nestjs/cli | 11.0.24 | Monorepo CLI (npm workspaces preferred over @nestjs/cli workspaces) |
| @nestjs/common | 12.0.3 | Common decorators/utilities |
| node | 20.19+ LTS | Runtime (22 LTS+ for CLI generators) |
| **Validation** | | |
| zod | 4.6.5 | Schema validation (v4 stable) |
| nestjs-zod | 5.5.0 | ZodValidationPipe, cleanupOpenApiDoc for Swagger |
| **API Documentation** | | |
| @nestjs/swagger | 12.0.1 | OpenAPI 3.1 support |
| @scalar/nestjs-api-reference | 1.2.18 | Modern Swagger UI alternative to Swagger UI |
| **Rate Limiting** | | |
| @nestjs/throttler | 6.5.0 | Rate limiter with Redis storage adapter |
| @nest-lab/throttler-storage-redis | 1.2.0 | Redis backend for throttler (ioredis-based) |
| **Redis & Caching** | | |
| ioredis | 6.0.0 | Redis client (required for BullMQ; BullMQ incompatible with node-redis) |
| @nestjs/cache-manager | 12.0.0 | Cache abstraction (v3+, uses Keyv Drizzle if needed) |
| **Job Queue** | | |
| bullmq | 6.3.6 | Job queue library (requires ioredis) |
| @nestjs/bullmq | 12.0.0 | BullMQ NestJS module |
| @bull-board/nestjs | 9.10.1 | Queue monitoring UI (mount behind auth) |
| @bull-board/api | 9.10.1 | Bull Board API |
| @bull-board/express | 9.10.1 | Express adapter for Bull Board |
| **Database ORM** | | |
| drizzle-orm | 0.45.2 | ORM (geometry type built-in; geography via customType) |
| drizzle-kit | 0.31.10 | Schema migration CLI |
| postgres | 3.4.9 | Postgres.js driver (prepared statements; beware AWS) |
| pg | 8.23.0 | node-postgres driver (alternative; slower for this stack) |
| **Logging** | | |
| nestjs-pino | 5.2.0 | Pino logger with AsyncLocalStorage for requestId |
| pino-http | 11.0.0 | HTTP middleware logger (child-logger per request) |
| **i18n** | | |
| nestjs-i18n | 10.8.5 | i18n with ICU plurals support; load per module |
| **Config** | | |
| @nestjs/config | 12.0.0 | Config module (pair with zod for env validation) |
| **Health Checks** | | |
| @nestjs/terminus | 12.0.0 | Health check indicators (/health/live, /health/ready) |
| **Testing** | | |
| vitest | 5.0.1 | Unit/integration test runner (@swc/core + unplugin-swc) |
| @testcontainers/postgresql | 12.1.0 | PostgreSQL container for tests (ensure PostGIS image) |
| @testcontainers/redis | ~9.0.0 | Redis container for integration tests |
| supertest | 6.3.x | HTTP assertion library for endpoint tests |

---

## Key Technical Decisions

**1. NestJS Monorepo**: Use npm workspaces (native Node 16+), not @nestjs/cli workspaces. Rspack default bundler (--webpack deprecated).

**2. Node LTS**: Target v20.19+ for runtime. Use v22.12+ or v24.15+ for CLI generators.

**3. Validation**: nestjs-zod 5.5.0 with `cleanupOpenApiDoc(openApiDoc)` call before `SwaggerModule.setup()` for correct Swagger schema.

**4. Swagger**: @nestjs/swagger 12.0.1 supports OpenAPI 3.1. Use Scalar (@scalar/nestjs-api-reference 1.2.18) for modern UI. Export openapi.json in CI for client codegen (openapi-typescript, orval, @hey-api/openapi-ts). Dart/Flutter: openapi-generator (dart-dio backend).

**5. Rate Limiting**: @nestjs/throttler 6.5.0 + @nest-lab/throttler-storage-redis 1.2.0. Configure multiple named throttlers, override getTracker, use skipIf for health endpoints. Returns Retry-After header.

**6. Redis Client**: Use ioredis 6.0.0 exclusively — BullMQ requires ioredis, node-redis incompatible. ioredis native async/await, superior error handling.

**7. Cache Manager**: @nestjs/cache-manager 12.0.0 (v3+). For small team: thin custom RedisService wrapper around ioredis over full cache-manager abstraction (simpler mental model).

**8. BullMQ**: @nestjs/bullmq 12.0.0, bullmq 6.3.6. Separate Redis DB for queues (e.g., DB 1 vs caching DB 0). Use `upsertJobScheduler` for repeatable jobs with `tz` for timezones. Enable `QueueEvents` for monitoring. Concurrency/limiter tuning per queue. Critical: `maxRetriesPerRequest: null` in Redis options.

**9. Drizzle ORM**: drizzle-orm 0.45.2 + drizzle-kit 0.31.10. Geometry type built-in for PostGIS; geography via customType (not yet native). Use sql template for ST_DWithin. Migration workflow: `drizzle-kit generate` → `drizzle-kit migrate` as separate CLI steps. UUID v7: use pg_uuidv7 extension or app-side uuidv7 npm package (Postgres 18+ has native uuidv7()).

**10. Database Driver**: postgres.js 3.4.9 recommended (prepared statements default—disable with prepare:false if AWS Lambdas used). pg 8.23.0 slower for this stack but stable option.

**11. i18n**: nestjs-i18n 10.8.5. Resolvers: AcceptLanguageResolver (header/query). ICU plurals built-in. Load JSON per module. Use for push notification templates.

**12. Logging**: nestjs-pino 5.2.0 + pino-http 11.0.0. AsyncLocalStorage auto-propagates requestId (avoid REQUEST scope for perf). Redact sensitive paths. pino-pretty dev-only.

**13. Config**: @nestjs/config 12.0.0 + zod for env validation. Alternative: znv/env-schema if minimal config.

**14. Health**: @nestjs/terminus 12.0.0. `/health/live` (app running), `/health/ready` (db+redis UP). Write custom indicator for Drizzle + ioredis (TypeOrmHealthIndicator N/A).

**15. Testing**: Vitest 5.0.1 (@swc/core + unplugin-swc for TS), @testcontainers/postgresql 12.1.0 (ensure PostGIS image), @testcontainers/redis ~9.0.0, Supertest.

**16. Docker**: Node 20-alpine base. Multi-stage Dockerfile. npm workspaces: install with `npm ci --workspaces`. Nginx: `least_conn` upstream, `keepalive 32`, `stop_grace_period: 30s`.

---

## Unresolved Questions

1. Does pg_uuidv7 extension conflict with app-side uuidv7 generation? Recommend testing in CI.
2. Exact PostGIS image tag for @testcontainers/postgresql (e.g., postgis/postgis:17-3.4)?
3. Bull Board auth middleware pattern (JWT, session, API key)?
4. Recommended Bull queue concurrency limits for typical NestJS endpoints on 4-core instances?
5. Should Drizzle relations use `d.one()` or eager loading for nested queries in this stateless architecture?

---

## Source URLs

- [NestJS Migration Guide](https://docs.nestjs.com/migration-guide)
- [NestJS CLI Workspaces](https://docs.nestjs.com/cli/monorepo)
- [nestjs-zod GitHub](https://github.com/BenLorantfy/nestjs-zod)
- [Drizzle ORM PostgreSQL Docs](https://orm.drizzle.team/docs/get-started-postgresql)
- [Drizzle PostGIS Geometry](https://orm.drizzle.team/docs/guides/postgis-geometry-point)
- [Rate Limiting NestJS](https://docs.nestjs.com/security/rate-limiting)
- [NestJS Redis Throttler](https://oneuptime.com/blog/post/2026-03-31-redis-nestjs-rate-limiting/view)
- [nestjs-pino GitHub](https://github.com/iamolegga/nestjs-pino)
- [npm @nestjs/core](https://www.npmjs.com/package/@nestjs/core)
- [npm @nestjs/bullmq](https://www.npmjs.com/package/@nestjs/bullmq)
- [npm drizzle-orm](https://www.npmjs.com/package/drizzle-orm)
