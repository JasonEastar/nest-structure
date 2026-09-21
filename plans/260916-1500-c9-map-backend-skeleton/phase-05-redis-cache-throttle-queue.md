# Phase 05 — Redis, cache, throttler, BullMQ + `pin.jobs.ts` scheduler, Bull Board

## Context links
- [plan.md](./plan.md) · [code-standards §2.1 stateless](../../docs/code-standards.md) · [system-architecture §7–§9](../../docs/system-architecture.md) · [nestjs-guide §8](../../docs/nestjs-guide.md) · [ADR-0006](../../docs/adr/0006-all-in-one-cau-truc-don-gian.md)
- NestJS docs [02 techniques](../reports/nestjs-docs-02-techniques.md) (queues, caching, task-scheduling), [03 rate limiting](../reports/nestjs-docs-03-security-openapi.md)

## Overview
**Ngày:** 2026-09-16 · **Ưu tiên:** P0 · **Trạng thái:** ✅ Hoàn thành 2026-09-16 (18 e2e: cache chung 2 instance, 429 đếm chung + Retry-After, 1 scheduler, job xử lý; Docker 2 container: 2 tick / 2 phút mỗi instance 1, ready có redis, Bull Board 200)
Mọi state chia sẻ ra Redis: cache, rate limit, queue. Processor và scheduler BullMQ sống trong module nghiệp vụ (`pin.jobs.ts`) và chạy trên **mọi instance** (all-in-one).

## Key insights
- **Thực tế:** `@nest-lab/throttler-storage-redis@1.2.0` và cả `@nestjs/throttler@6.5.0` chưa khai peer Nest 12 → `npm ci` trong Docker fail (host npm 11 bỏ qua). Giải: bỏ package storage, viết `RedisThrottlerStorage` (Lua atomic, ~40 dòng) trong `throttler.guard.ts`; `package.json` `overrides` ép peer của `@nestjs/throttler` theo bản Nest đã cài (code chạy đúng, e2e xanh). Lockfile npm 11 ≠ npm 10 trong image → Dockerfile `npm i -g npm@11`, `engines.npm >= 11`.
- Route 404 không đi qua guard → test rate limit phải dùng route thật (`ProbeController` trong e2e). Bull Board là Express middleware, **không** qua guard Nest → phase 06 bảo vệ bằng middleware kiểm JWT + permission, không phải `@RequirePermissions`.
- BullMQ 6 `getJobSchedulers()` trả `key` (không `id`). Readiness 503 khi shutdown: **Terminus 12 có sẵn** (`HealthCheckExecutor.beforeApplicationShutdown` → `status: shutting_down`, `gracefulShutdownTimeoutMs: 5000` giữ app 5 s cho LB rút) → bỏ `ShutdownState` tự viết sau review. `AllExceptionsFilter` giữ nguyên body Terminus cho `/health/*`. Bỏ provider `REDIS_QUEUE` (BullMQ tự mở kết nối); Bull Board bật bằng `ConditionalModule.registerWhen` (không đọc `process.env` trong module).
- Bài học vận hành: process `dist/main` cũ trên host giữ port 3000 làm nginx không bind và kết quả curl giả (đọc từ host thay vì nginx) → smoke phase 07 phải kiểm `X-Instance-Id` khớp container.
- ioredis 2 connection: `REDIS_CACHE` (db0) và `REDIS_QUEUE` (db1, `maxRetriesPerRequest: null`). Prod tách 2 Redis instance vì eviction không đặt theo DB — ghi chú compose.
- `CacheService` mỏng trên ioredis (`get/set/del/incr/sadd/zadd`, key `c9:v1:*`), không `@nestjs/cache-manager`, NEVER read-modify-write JSON.
- Throttler: `AppThrottlerGuard extends ThrottlerGuard` override `getTracker` → `u:{userId}` (phase 06) → `d:{x-device-id}` → `ip:` (từ `X-Forwarded-For`, `trust proxy` đã bật). 2 tầng `short` 10/s, `long` 100/phút; `skipIf` health/docs; `Retry-After`.
- BullMQ: `BullModule.forRootAsync({ connection: db1, prefix: 'c9' })` trong `common/queue.ts`; queue name hằng. Processor `@Processor(MARKER_MAINTENANCE) extends WorkerHost`, `process(job)` switch `job.name`; `@OnWorkerEvent('failed')` log. Scheduler `onApplicationBootstrap` → `queue.upsertJobScheduler('marker-expire', { pattern: '* * * * *', tz: 'Asia/Ho_Chi_Minh' })` — id cố định nên 2 instance chỉ tạo 1.
- **Không `@nestjs/schedule`** (cron × replica). `EventEmitterModule` không dùng cho việc phải xảy ra.
- `enableShutdownHooks` (đã có) → `@nestjs/bullmq` đóng worker, job đang chạy được chờ trong `stop_grace_period 60s`.
- Bull Board `/admin/queues`: phase này chỉ bật khi `NODE_ENV=development`; phase 06 thêm `@RequirePermissions('queue:read')`.

## Requirements
- 15 request nhanh qua nginx (2 instance) → có 429 + `Retry-After`; đếm chung.
- Scheduler log đúng **1 dòng/phút** dù 2 instance.
- `/health/ready` thêm Redis ping.
- Bull Board hiển thị queue `marker-maintenance` và scheduler.

## Architecture
```
src/common/
├── redis.ts                      # REDIS_CACHE, REDIS_QUEUE providers (ioredis) · CacheService · cacheKeys (c9:v1:…) · TTL const
├── queue.ts                      # BullModule.forRootAsync (db1, prefix c9) · QUEUES = { MARKER_MAINTENANCE: 'marker-maintenance', … }
├── throttler.guard.ts            # AppThrottlerGuard (getTracker) · ThrottlerModule.forRootAsync (storage ThrottlerStorageRedisService, 2 tầng)
└── common.module.ts              # thêm providers/exports REDIS_*, CacheService
src/modules/pin/
├── pin.module.ts                 # BullModule.registerQueue(MARKER_MAINTENANCE) · providers PinJobs, PinScheduler
├── pin.constants.ts              # PIN_TTL_DEFAULTS, PIN_RATE_LIMITS (hằng số nghiệp vụ, dùng từ gđ pin core)
├── pin.schema.ts                 # rỗng/placeholder tới bước pin core (không tạo bảng ở phase này)
└── pin.jobs.ts                   # PinJobs @Processor(WorkerHost) · PinScheduler (OnApplicationBootstrap → upsertJobScheduler)
src/common/bull-board.ts          # BullBoardModule.forRoot({ route: '/admin/queues' }) + forFeature — import có điều kiện trong AppModule
src/health/health.indicators.ts   # thêm RedisHealthIndicator
src/app.module.ts                 # providers: { APP_GUARD: AppThrottlerGuard } (đầu tiên) · imports ThrottlerModule, QueueModule config, PinModule
```
Env: `REDIS_URL`, `REDIS_CACHE_DB=0`, `REDIS_QUEUE_DB=1`, `THROTTLE_SHORT_LIMIT=10`, `THROTTLE_LONG_LIMIT=100`.

## Related code files (CREATE)
- `src/common/{redis.ts, queue.ts, throttler.guard.ts, bull-board.ts}`
- `src/modules/pin/{pin.module.ts, pin.constants.ts, pin.schema.ts, pin.jobs.ts}`
- sửa `src/common/common.module.ts`, `src/health/health.indicators.ts`, `src/health/health.controller.ts`, `src/app.module.ts`, `src/config/env.ts`, `docker-compose.yml` (ghi chú 2 Redis prod)
- `scripts/smoke-rate-limit.sh` (tạm; gộp vào phase 07)

## Implementation steps
1. Cài deps phase 05. `env.ts` thêm biến Redis/throttle.
2. `redis.ts`: 2 provider factory từ `REDIS_URL` + db; `CacheService` + `cacheKeys`; `onModuleDestroy` quit.
3. `queue.ts`: `BullModule.forRootAsync` inject `REDIS_QUEUE` connection options (`host/port/db`, `maxRetriesPerRequest: null`); `QUEUES`.
4. `throttler.guard.ts`: `ThrottlerModule.forRootAsync({ throttlers: [{ name:'short', ttl:1000, limit }, { name:'long', ttl:60000, limit }], storage: new ThrottlerStorageRedisService(redis), skipIf })` + `AppThrottlerGuard`; đăng ký `APP_GUARD` **đầu tiên** trong `app.module.ts`.
5. `pin.jobs.ts`: processor log `job expire tick instance=…`; scheduler `upsertJobScheduler` id cố định. `pin.module.ts` registerQueue + providers.
6. `bull-board.ts` import có điều kiện `env.NODE_ENV === 'development'` (guard phase 06).
7. `RedisHealthIndicator` (ping) → `/health/ready`.
8. Chạy `dev:infra:full`; kiểm rate limit chung, cron 1 dòng/phút (`docker compose logs api-1 api-2 | grep 'expire tick'`).

## Todo
- [x] redis.ts (2 connection + CacheService + keys)
- [x] queue.ts BullModule root + QUEUES
- [x] throttler.guard.ts + APP_GUARD đầu tiên
- [x] pin.module / pin.constants / pin.schema placeholder / pin.jobs (processor + scheduler)
- [x] bull-board.ts (dev only)
- [x] Redis health indicator
- [x] Smoke: 429 chung, cron 1 lần/phút

## Success criteria
```
for i in $(seq 15); do curl -s -o /dev/null -w "%{http_code}\n" :3000/api/v1/__ping; done | grep -c 429   # ≥ 1 (route mẫu tạm)
curl -s -D - :3000/api/v1/__ping | grep -i retry-after
sleep 130 && docker compose logs api-1 api-2 | grep -c 'expire tick'         # 2 (2 phút, 1 dòng/phút, không nhân đôi)
curl -s :3000/health/ready | jq -e '.info.redis.status=="up"'
open http://localhost:3000/admin/queues
```

## Risk assessment
| Rủi ro | Phòng |
|---|---|
| Processor chạy trên mọi instance tranh CPU với API | Chấp nhận gđ 1; concurrency thấp (2); theo dõi p95; tách worker bằng env khi cần (ADR-0006) |
| Throttler đọc IP nginx thay vì client | `trust proxy` = 1 + `X-Forwarded-For` |
| Redis eviction xoá job (local 1 instance) | Local không đặt eviction; prod 2 instance |
| `upsertJobScheduler` khác id giữa deploy → lịch trùng | Id hằng trong `pin.jobs.ts`; đổi pattern = cùng id |

## Security considerations
- Bull Board chỉ dev cho tới khi có guard; không publish port ngoài nginx.
- Redis bind `127.0.0.1`; prod dùng AUTH + TLS (ElastiCache).

## Next steps
→ [phase-06](./phase-06-supabase-auth.md): AuthGuard, PermissionGuard, profile upsert, `/me`.
