# ADR-0006 — All-in-one (không `APP_ROLE`) và cấu trúc thư mục đơn giản

**Ngày:** 2026-09-16 · **Trạng thái:** Accepted · **Thay thế:** quyết định "Nest CLI monorepo mode + `libs/contracts` + `APP_ROLE`" trong decisions-pending #32 và code-standards §3 bản cũ

## Bối cảnh
Cấu trúc skeleton trước có `APP_ROLE` (all/api/worker/admin), ba module wiring (`api.module`, `worker.module`, `core.module`), `shared/` với 14 thư mục con mỗi cái 1–3 file, `config/` 5 file, `libs/contracts` chạy monorepo mode + path alias. Người dùng nhận xét: loạn, rối, chưa rõ ràng. Đội 1–2 người, chưa có người dùng; mobile chỉ dùng `openapi.json`, không cần package TypeScript chung.

## Quyết định
1. **All-in-one:** một process chạy cả HTTP lẫn BullMQ processor. Không `APP_ROLE`, không `WorkerModule`/`ApiModule`. Scale bằng **số instance** (`docker compose --scale api=N` sau nginx). Tách worker khi đo được push fan-out làm chậm API — lúc đó thêm một biến env, không đổi cấu trúc.
2. **Một project `nest new` tiêu chuẩn**, không monorepo mode, không `libs/`. Cây thư mục *lúc ra quyết định* (đã được cập nhật ở mục "Sửa đổi 2026-09-17" cuối file; cây hiện tại xem [code-standards.md §3](../code-standards.md)):

```
c9_map/
├── src/
│   ├── main.ts                 # bootstrap duy nhất
│   ├── app.module.ts           # imports CommonModule + feature modules; providers APP_GUARD/PIPE/FILTER/INTERCEPTOR
│   ├── config/env.ts           # zod schema + typed env (1 file)
│   ├── common/                 # hạ tầng dùng chung — phẳng, 1 file / 1 việc, không thư mục con
│   │   ├── common.module.ts    # @Global: gom provider Database, Redis, Cache, Queue, Supabase, Logger, I18n
│   │   ├── database.ts         # Drizzle client, geography customType, uuidv7
│   │   ├── schema.ts           # barrel: export * from '../modules/*/x.schema' — để drizzle(client,{schema}) có kiểu
│   │   ├── redis.ts            # 2 connection (cache db0, queue db1) + CacheService mỏng + cache keys
│   │   ├── queue.ts            # BullModule root + tên queue
│   │   ├── supabase.ts         # SUPABASE_ADMIN port/adapter + SupabaseJwtService (JWKS)
│   │   ├── auth.guard.ts       # Bearer → JWKS → ensureProfile → req.user; @Public()
│   │   ├── permission.guard.ts # @RequirePermissions + cache c9:perms
│   │   ├── throttler.guard.ts  # tracker user → device → ip, storage Redis
│   │   ├── decorators.ts       # Public, RequirePermissions, CurrentUser
│   │   ├── exceptions.ts       # ErrorCodes, AppException, AllExceptionsFilter
│   │   ├── validation.ts       # provider APP_PIPE = StandardSchemaValidationPipe({ exceptionFactory })
│   │   ├── response.ts         # ResponseInterceptor { data, meta } + envelope schema + cursor pagination
│   │   ├── request-context.middleware.ts  # X-Instance-Id, X-Request-Id
│   │   ├── logger.ts           # nestjs-pino config
│   │   ├── i18n.ts             # nestjs-i18n config + LocaleResolver
│   │   └── openapi.ts          # 2 document + hàm export JSON
│   ├── health/
│   │   ├── health.controller.ts        # /health/live, /health/ready
│   │   └── health.indicators.ts        # Drizzle + Redis (HealthIndicatorService)
│   └── modules/                # nghiệp vụ — mỗi module một thư mục, tên file có tiền tố module
│       ├── identity/
│       │   ├── identity.module.ts
│       │   ├── identity.controller.ts        # /me
│       │   ├── identity-admin.controller.ts  # /admin/roles, /admin/users/:id/roles
│       │   ├── identity.service.ts
│       │   ├── identity.repository.ts
│       │   ├── identity.schema.ts            # bảng Drizzle: profiles, roles, permissions, role_permissions, user_roles, devices
│       │   └── identity.dto.ts               # zod request/response
│       └── pin/
│           ├── pin.module.ts
│           ├── pin.schema.ts
│           ├── pin.constants.ts              # tuổi thọ, rate limit, tier — hằng số nghiệp vụ
│           └── pin.jobs.ts                   # @Processor + upsertJobScheduler (cùng module, cùng process)
├── drizzle/                    # migration SQL (0000 extensions, 0001…, seed)
├── drizzle.config.ts           # schema: 'src/**/*.schema.ts'
├── test/                       # integration (testcontainers) + e2e (supertest); unit *.spec.ts cạnh code
├── scripts/                    # smoke-multi-instance.sh, dev-token.mjs
├── i18n/{vi,en}/*.json
├── openapi/                    # app.json, admin.json (CI sinh)
├── Dockerfile · docker-compose.yml · nginx.conf · vitest.config.ts · .env.example
└── package.json · tsconfig.json · nest-cli.json (mặc định của nest new)
```

3. **DTO và schema Drizzle nằm cạnh module** (`*.dto.ts`, `*.schema.ts`). `drizzle-kit` gom bằng glob `src/**/*.schema.ts`. Hằng số nghiệp vụ trong `*.constants.ts` của module sở hữu.
4. **Quy tắc đặt tên:** file trong `modules/<x>/` luôn bắt đầu bằng `<x>.` hoặc `<x>-`; `common/` một file một việc, không tạo thư mục con cho tới khi một việc vượt 200 dòng (lúc đó tách thành `common/<việc>/`).
5. `@nestjs/bullmq` processor sống trong module nghiệp vụ; `app.enableShutdownHooks()` để worker đóng job khi container dừng.
6. **Quy tắc bổ sung (từ review 2026-09-16, `plans/reports/researcher-260916-adr0006-review-summary.md`):**
   - `*.schema.ts` chỉ import từ `drizzle-orm` và `*.schema.ts` khác — NEVER import `common/database.ts` (tránh vòng barrel ↔ module ↔ db).
   - FK liên module đi một chiều (`pin` → `identity`). MVP không dùng `relations()` / `db.query`, chỉ `db.select()` + join; nếu cần sau, gom `relations()` vào một file `common/relations.ts`.
   - Options của `upsertJobScheduler` là hằng số trong `<x>.constants.ts`, không tính từ env/runtime (N instance cùng upsert, khác nhau → last writer wins).
   - Migration là bước CI riêng **bắt buộc**: `drizzle-orm` `migrate()` không có advisory lock, N instance cùng migrate lúc boot sẽ đua.
   - `@Processor(name, { concurrency })` đặt tường minh cho từng queue.

## Hệ quả
- Bỏ: `APP_ROLE`, `api.module.ts`, `worker.module.ts`, `core.module.ts`, `libs/`, `nest-cli.json` monorepo, path alias `@c9/contracts`, `registerAs` namespaces (env đọc từ `config/env.ts` có kiểu).
- Số thư mục ở `src/` giảm từ ~25 xuống 6 (`config`, `common`, `health`, `modules/identity`, `modules/pin`).
- Mọi instance chạy cả cron/queue: scheduler `upsertJobScheduler` id cố định vẫn đảm bảo chạy một lần; tải push lớn sẽ cạnh tranh CPU với API — chấp nhận ở gđ 1, theo dõi p95.
- Muốn chia sẻ zod với admin web sau này: `nest g library contracts` lúc đó, không phải bây giờ.

---

## Sửa đổi 2026-09-17 — gom `common/` theo nhóm, module có `dto/` + `schema/`

**Lý do:** sau 7 phase, `common/` có 21 file phẳng (kể cả spec) và `identity/` 7 file cùng tiền tố → khó đọc cho người mới (đặc biệt dev FE). Quy tắc cũ "không thư mục con cho tới khi vượt 200 dòng" (mục 4) không còn phù hợp.

**Quyết định (thay mục 4 ở trên):**
- Theo quy ước Nest CLI `nest g resource` và rule `arch-feature-modules` (skill nestjs-best-practices): file chính của module ở gốc, chỉ 2 thư mục con `dto/` và `schema/` (Drizzle, thay `entities/`). **Không** tách `controllers/ services/ repositories/` kiểu một-file-một-thư-mục.
- `common/` gom theo mối quan tâm: `auth/ database/ redis/ http/`. `logger/i18n/openapi` là cấu hình module → `config/`. `health/` là module → `modules/health/`.
- Test rời khỏi `src/`: `test/unit/` · `test/integration/` · `test/setup/`.
- Đổi tên 2 file cho khỏi lặp thư mục: `database.ts` → `database/drizzle.ts`, `redis.ts` → `redis/cache.ts`. Không đổi tên export, không đổi logic.

Cây đầy đủ: [code-standards.md §3](../code-standards.md). Kiểm chứng: 55/55 test, build, openapi export xanh sau khi di chuyển.

