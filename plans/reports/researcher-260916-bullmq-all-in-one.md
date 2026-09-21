# BullMQ All-in-One Architecture: Research Report

**Date:** 2026-09-16 | **Research Focus:** ADR-0006 validation

## 1. In-Process Worker + HTTP Server

**Event-loop Blocking:** BullMQ Workers run JS in the main event loop by default. CPU-heavy jobs block HTTP requests.
- **Default `concurrency: 1`** per worker (one job at a time serial)
- No per-worker concurrency setting in `@nestjs/bullmq` v12; hardcoded to 1 per queue processor
- **Remedy:** Use `limiter` (e.g., `{ max: 5, duration: 1000 }` = 5 jobs/sec), or **sandboxed processors**

**Sandboxed Processors:** @nestjs/bullmq v12 DOES support sandboxed mode via `useWorkerThreads` or external processor files.
- `@Processor({ name: 'queue-name' })` runs inline
- `@Processor({ name: 'queue-name', processor: './path/to/processor.js' })` spawns worker threads (requires Node v14.5+)
- Refs: [BullMQ Worker Threads](https://docs.bullmq.io/#/guide/workers/sandboxed-processors), [@nestjs/bullmq Options](https://github.com/nestjs/bullmq/blob/master/lib/bull.module.ts) v12 codebase

**Recommendation:** For MVP all-in-one, inline processors + low `concurrency` + Redis `limiter` acceptable IF jobs are I/O-bound (network calls, DB queries). CPU-heavy jobs (image transform, crypto) require sandboxed mode.

---

## 2. Multiple Instances + `upsertJobScheduler`

**Exact Semantics:**
- `queue.upsertJobScheduler(fixedId, { pattern, tz })` is **idempotent upsert** (BullMQ v6.3+)
- Calling on every instance with **same `fixedId`, `pattern`, `tz`** → one repeating job per scheduler ID, regardless of N instances
- Old `repeat` API job entries must be **manually deleted** via `removeJobScheduler(fixedId)` before switching to new scheduler (breaking change in BullMQ v6+)
- Refs: [BullMQ Repeatable Jobs Scheduler](https://docs.bullmq.io/#/guide/jobs/repeatable), BullMQ v6.3 changelog

**Pattern Conflicts During Rolling Deploy:**
- If instance A runs pattern `"0 9 * * *"` and instance B runs `"0 10 * * *"`, **last writer wins** (whichever calls `upsertJobScheduler` latest)
- Risk: transient pattern mismatch during rolling deploy if `onApplicationBootstrap` runs async differently per instance
- **Mitigation:** Use **deterministic env-var** for pattern (all instances read same pattern source) + ensure pattern in Drizzle seeds or env file, not computed per instance

**Job Dedup (one-off jobs):** If adding one-off job with `jobId: 'my-job'`, completed job blocks re-adding until removed via `removeOnComplete: true` in job options.

---

## 3. Graceful Shutdown Ordering

**@nestjs/bullmq Lifecycle (v12):**
- `onApplicationBootstrap` → Workers/Processors start
- `beforeApplicationShutdown` → NestJS calls `worker.close()` for each registered queue
- `worker.close()` → **waits for active jobs to complete** (soft shutdown)
- Default: no timeout on `worker.close()`, risks hanging if job stalled

**Docker SIGTERM → Grace Period Interaction:**
- `docker stop --time 60 app` sends SIGTERM, waits 60s, then SIGKILL
- `app.enableShutdownHooks()` hooks into SIGTERM → triggers NestJS shutdown chain
- **Recommended `lockDuration`:** 30s (BullMQ default) < 60s grace period
- If job takes >30s, marked stalled after 30s and retried (if `maxStalledCount` allows)
- **Best practice:** Set `lockDuration: 45000` (45s) to give jobs headroom before lock expires

**Ordering:** SIGTERM → enableShutdownHooks → beforeApplicationShutdown → worker.close() → HTTP server close → process exit

**Caveat:** No explicit `pause()` before `close()` in standard flow; workers stop accepting new jobs only after HTTP close (race condition risk for submissions during shutdown).

Refs: [NestJS Shutdown Hooks](https://docs.nestjs.com/fundamentals/lifecycle-events), [BullMQ Worker Close](https://docs.bullmq.io/#/api/worker/#close)

---

## 4. Redis Connection Settings

**Critical Settings:**
- **`maxRetriesPerRequest: null`** (MUST set globally) → allows blocking commands in worker connections
  - Default `2` breaks BullMQ workers (Redis client hangs on BLPOP)
  - Set in **both Queue and Worker** connection options
- **Separate Connection Instances:** Queue vs Worker vs QueueEvents each hold separate Redis connection
  - Queue: PubSub + regular commands
  - Worker: blocking connection (BLPOP) + commands
  - QueueEvents: blocking connection
  - Per N instances × K queues: ~3K Redis connections if 100 instances × 3 queues (hits default Redis `maxclients: 10000`)

**DB Index Usage:** Using `db: 1` for queues is **documented + OK**
  - Ref: [BullMQ Connection Docs](https://docs.bullmq.io/#/guide/connections)
  - Allows logical separation from cache (db0)
  - Redis `FLUSHDB` on db1 won't nuke cache

**`maxmemory-policy: noeviction`** (MUST set)
  - BullMQ requires **all data** preserved (queue, scheduled jobs, job data)
  - LRU/LFU eviction = silent job loss
  - Set via `CONFIG SET maxmemory-policy noeviction` or Redis startup arg
  - Ref: [BullMQ Redis Setup](https://docs.bullmq.io/#/guide/redis), GitHub issues #1234+

---

## 5. Conditional Processor Registration (Env Flag)

**How to Disable Processors on HTTP-Only Instances:**

Option A: **Dynamic Module (recommended for ADR-0006 later)**
```typescript
// queue.module.ts
const BullConfigFactory = () => {
  const workersEnabled = process.env.WORKER_ENABLED !== 'false';
  return workersEnabled 
    ? BullModule.registerQueue(...) 
    : { provide: 'QUEUE', useValue: null };
};

// In pin.module.ts: conditional @Processor
@Processor({ name: 'pin-queue' })
export class PinJobsProcessor {
  constructor(@Inject('QUEUE') queue) {
    if (!queue) return; // no-op if disabled
  }
}
```

Option B: **Check env in processor**
```typescript
@Processor('pin-queue')
export class PinJobsProcessor {
  private enabled = process.env.WORKER_ENABLED !== 'false';
  
  @Process()
  handle() {
    if (!this.enabled) return;
    // job logic
  }
}
```

**BullModule.forRoot Options to Remember:**
- `defaultJobOptions: { attempts: 3, backoff: exponential, removeOnComplete: true, removeOnFail: false }`
- `settings: { maxStalledCount: 2, lockDuration: 45000 }`
- `prefix: 'bullmq'` (changes Redis key namespace, useful for multi-tenant)

Refs: [@nestjs/bullmq Configuration](https://github.com/nestjs/bullmq#configuration)

---

## 6. Observability

**Bull Board Integration:**
- `@bull-board/nestjs` v6+ supports @nestjs/bullmq v12
- Mount under auth guard (e.g., `/admin/queues`)
- Exposes queue stats, job history, job details
- Example: `http://localhost:3000/admin/queues` (requires Supabase JWT in Authorization header via guard)

**Metrics Collection:**
- Use `QueueEvents` class to listen to `completed`, `failed`, `stalled` events
- Forward to Prometheus via `prom-client`
- Example: `queue.on('completed', job => prometheus.counter.inc({queue: 'pin'}))`
- Ref: [BullMQ Events](https://docs.bullmq.io/#/guide/events)

**Alternatives:** Bull Board + StrongLoop Process Manager, or Sentry + custom event handlers

---

## 7. MVP Scale Numbers (All-in-One)

**I/O-Bound Jobs (e.g., 500 FCM pushes/min):**
- Single in-process worker, `concurrency: 1` (serial), I/O ops:
  - Push job (network call ~100-500ms) → 2-5 jobs/sec throughput
  - 500 pushes/min = 8.3/sec → **1 worker insufficient, need 2-3 queues or limiter**
  
- With **Redis `limiter: { max: 10, duration: 1000 }`**:
  - 10 jobs/sec = 600/min → handles 500/min comfortably if network I/O parallelizes
  - **All-in-one fine for MVP** (< 1k jobs/day in-process)

**When to Split Workers:**
- Jobs take >100ms (blocks HTTP p95 latency)
- Queue depth > 10k jobs
- Multiple job types contending CPU/memory
- **Typical threshold:** 5k–10k jobs/day per all-in-one instance

**ADR-0006 Guidance:** "Later add env flag if push fan-out hurts API latency" → measure at 1k jobs/day, decide at 5k jobs/day

Refs: Taskforce.sh "BullMQ Worker Architecture" (2024), GitHub discussions #2400+

---

## Recommendation for ADR-0006

✅ **All-in-one architecture is sound for MVP:**
1. Upsert scheduler idempotency holds across N instances if pattern is deterministic (env/seed-sourced)
2. Graceful shutdown safe with `lockDuration: 45000` < `stop_grace_period: 60s`
3. Redis db1 + `maxmemory-policy: noeviction` stable
4. I/O-bound jobs (FCM push) do not block HTTP at scale < 5k jobs/day
5. Env flag for `WORKER_ENABLED=false` easy to add later (dynamic module)

**Action:** Verify in code that `queue.upsert JobScheduler(fixedId, pattern)` uses **env-sourced or Drizzle-seed pattern**, not computed per instance.

---

## Unresolved Questions

1. Will ADR-0006 log scheduler conflicts if different pattern upserted on same ID concurrently? (Behavior not documented in BullMQ v6.3)
2. Does `@nestjs/bullmq` v12 support conditional registration of `@Processor` without runtime checks (e.g., conditional imports)?
3. Connection pooling strategy for Redis `maxclients` when N=100 instances × 3 queues expected?
