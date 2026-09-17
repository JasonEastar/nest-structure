# Quy chuẩn code — C9 Map

**Cập nhật:** 2026-09-17 · **Trạng thái:** Active · **Chủ sở hữu:** Tech Lead
Quy tắc bắt buộc khi viết code cho `c9_map`: nguyên tắc bất biến, cấu trúc thư mục, đặt tên, module NestJS, quy chuẩn tài liệu, git. Cấu hình từng công nghệ xem [system-architecture](./system-architecture.md); quy tắc sản phẩm xem [project-overview-pdr](./project-overview-pdr.md).

---

## 1. Nguyên tắc

| Nguyên tắc | Ý nghĩa cho C9 Map |
|---|---|
| **YAGNI** | Không xây trước thứ chưa cần: không WebSocket, không microservice, không Elasticsearch, không module ngoài roadmap |
| **KISS** | Một cách làm cho một việc. Cache = Redis, queue = BullMQ, auth = Supabase. Không có "lựa chọn thứ hai" trong code |
| **DRY** | Schema zod, ErrorCodes, hằng số (tuổi thọ pin, tier rep, rate limit) chỉ khai báo một chỗ: `*.dto.ts` / `*.constants.ts` của module sở hữu, `common/http/exceptions.ts` (ErrorCodes) |
| **File < 200 dòng** | Tách theo trách nhiệm: controller / service / repository / geo-repository / jobs |
| **kebab-case + hậu tố** | Tên file tự mô tả mục đích, đọc được bằng `grep` mà không cần mở |
| **Không mock để qua test** | PostGIS, Redis, BullMQ test trên container thật. Xem [testing-and-ci](./testing-and-ci.md) |

---

## 2. Nguyên tắc bất biến

Vi phạm là **bug**, không phải lựa chọn style.

### 2.1 Đa instance — mọi thứ phải stateless

```
NEVER  giữ state trong RAM sống lâu hơn một request:
       new Map(), new Set(), mảng module-level, biến đếm, cache in-memory
NEVER  dùng @Cron của @nestjs/schedule, setInterval, setTimeout lặp
NEVER  ghi file upload ra disk local
NEVER  lưu session ở server
MUST   mọi state dùng chung → Redis (tạm) hoặc Postgres (bền)
MUST   job định kỳ → BullMQ upsertJobScheduler với id cố định + tz Asia/Ho_Chi_Minh
MUST   dev bằng docker-compose với 2 replica ngay từ đầu
```

Câu tự vấn khi viết bất kỳ biến nào: *"Instance 2 có cần biết cái này không?"* Có → ra ngoài process.

### 2.2 Ranh giới module

```
MUST   chia thư mục theo nghiệp vụ (modules/pin/), KHÔNG theo tầng (controllers/)
MUST   @Module() chỉ export service — NEVER export repository
MUST   common/ không import từ modules/ (một chiều)
MUST   @Processor là provider của module nghiệp vụ (pin.jobs.ts) — mọi instance chạy processor (all-in-one, ADR-0006)
NEVER  import trực tiếp file bên trong module khác (chỉ qua service đã export)
```

### 2.3 Dữ liệu

```
MUST   khoá chính UUID v7 (time-ordered) cho mọi bảng nghiệp vụ — ngoại lệ: seed tĩnh trong SQL (roles, permissions) dùng gen_random_uuid() public.*
MUST   TIMESTAMPTZ, luôn UTC — NEVER dùng TIMESTAMP không TZ
MUST   cột toạ độ: geography(Point, 4326) + index GIST
MUST   ST_DWithin cho tìm bán kính — NEVER ST_Distance(...) < x (không dùng index)
MUST   mọi SQL không gian nằm trong *-geo.repository.ts — NEVER rải trong service
MUST   phân trang bằng cursor (created_at, id) — NEVER OFFSET
MUST   bảng user_locations: một dòng mỗi user, UPSERT — NEVER bảng lịch sử có GIST
MUST   notifications partition theo tháng
MUST   migration là bước riêng trong deploy — NEVER chạy lúc boot (drizzle migrate() không có lock, N instance sẽ đua)
MUST   *.schema.ts chỉ import drizzle-orm, util npm thuần (uuidv7) và *.schema.ts khác — NEVER import common/database/drizzle.ts hay service
MUST   FK liên module một chiều (pin → identity); MVP dùng db.select() + join — NEVER relations()/db.query
MUST   options upsertJobScheduler là hằng số trong <x>.constants.ts — NEVER tính từ env/runtime
NEVER  ghi vào schema auth.* — chỉ đọc qua Supabase Admin API
MUST   public.profiles.id = sub của Supabase, KHÔNG FK (khác database) — tạo bằng upsert phía app, xoá qua Admin API + tx local
MUST   bảng app nằm trong schema public; auth.* thuộc Supabase, không migrate bằng drizzle-kit
```

### 2.4 Quyền riêng tư

```
NEVER  đưa author_id (kể cả đã băm) vào DTO công khai của pin Live
NEVER  cache nội dung đã lọc theo quyền — chỉ cache phần public
MUST   SĐT thô chỉ nằm ở Supabase Auth; public.* chỉ giữ HMAC + last4 nếu cần tra cứu
MUST   push_token gắn với devices(user_id, device_id) — NEVER gắn trực tiếp vào profiles
MUST   strip EXIF (GPS) mọi ảnh trong job media trước khi public
NEVER  log: token, OTP, mật khẩu, toạ độ chính xác của user, nội dung riêng tư
NEVER  dùng SUPABASE_SERVICE_ROLE_KEY ở client hoặc trong log/response
```

### 2.5 API

```
MUST   server trả mã lỗi (ErrorCodes trong contracts), client dịch — NEVER trả câu tiếng Việt
MUST   response shape: { data, meta } / { error: { code, params, requestId } }
MUST   AuthGuard global; route mở dùng @Public()
MUST   mọi route ghi có @RequirePermissions('<resource>:<action>') — quyền nằm trong DB + Redis, NEVER trong JWT
MUST   SOS (gđ 2) có @RequirePhoneVerified() — không global; MVP đăng nhập chỉ Google, không cần SĐT
MUST   rate limit khoá theo user → x-device-id → IP (thứ tự đó)
MUST   POST tạo tài nguyên nhạy cảm (SOS, thanh toán, pin, reply) nhận Idempotency-Key
MUST   /api/v1 prefix
MUST   mọi response có X-Instance-Id, X-Request-Id
NEVER  tự phát hành access token — JWT do Supabase Auth phát, NestJS chỉ verify qua JWKS
```

### 2.6 Hành vi của Claude Code

```
MUST   đọc plan đã duyệt trước khi tạo file
NEVER  thêm dependency, xoá file, hoặc sửa schema DB mà không hỏi
NEVER  thêm tính năng, abstraction, hoặc file ngoài phạm vi được yêu cầu
NEVER  tạo file "cho đủ bộ" (thư mục rỗng, interface không dùng, test placeholder)
MUST   sau mỗi bước: liệt kê file đã tạo/sửa và lý do
MUST   dừng và hỏi khi: gặp mâu thuẫn giữa tài liệu, cần quyết định sản phẩm
       (xem decisions-pending), hoặc một bước vượt 15 file
```

---

### 2.7 Từ skill `nestjs-best-practices` (đã lọc cho C9 Map — xem nestjs-guide.md §12)

```
MUST   adapter ngoài (FCM, R2, payment, SMS, Supabase admin) đứng sau Symbol token + interface nhỏ — NEVER inject class SDK trực tiếp vào service nghiệp vụ
MUST   mỗi adapter có contract test dùng chung cho bản thật và bản mock (LSP)
MUST   promise không await (fire-and-forget) có .catch() ghi log — NEVER để unhandled rejection
MUST   main.ts đăng ký process.on('unhandledRejection'|'uncaughtException') → log rồi thoát
MUST   text người dùng nhập (note, reply, display name) strip HTML trong zod schema — NEVER lưu HTML thô
MUST   service trả object theo ResponseSchema trong contracts — NEVER trả raw row Drizzle ra controller
MUST   lỗi trả mã ErrorCodes + params — NEVER nhúng input người dùng vào message
MUST   list endpoint = một query (join / inArray) — NEVER query trong vòng lặp (N+1)
MUST   /health/ready trả 503 khi app đang shutdown
NEVER  @nestjs/schedule, setInterval, EventEmitter cho việc phải xảy ra — dùng BullMQ scheduler / outbox
NEVER  Scope.REQUEST — cần request context thì nestjs-cls
NEVER  app.useGlobalGuards/Pipes/Filters/Interceptors — dùng token APP_*
```

## 3. Cấu trúc thư mục mục tiêu

```
c9_map/
├── src/
│   ├── main.ts                       # điểm vào server: load-env → createApp → Swagger UI → listen
│   ├── app.ts                        # createApp(): helmet · trust proxy · prefix /api · version v1 · shutdown hooks (dùng chung với openapi-export)
│   ├── app.module.ts                 # imports ConfigModule + CommonModule + modules; providers APP_GUARD Throttler → Auth → Permission · APP_PIPE · APP_FILTER · APP_INTERCEPTOR
│   ├── openapi-export.ts             # `npm run openapi:export` → openapi/{app,admin}.json
│   ├── config/                       # cấu hình app — không nghiệp vụ, không hạ tầng
│   │   ├── env.ts                    # zod schema → `env` có kiểu, fail-fast lúc boot
│   │   ├── load-env.ts               # nạp .env (import đầu tiên của main.ts / openapi-export.ts)
│   │   ├── logger.ts                 # nestjs-pino: genReqId · redact · bỏ log /health
│   │   ├── i18n.ts                   # nestjs-i18n vi/en, resolver Accept-Language
│   │   └── openapi.ts                # 2 DocumentBuilder (app, admin) · exportOpenApi()
│   ├── common/                       # hạ tầng dùng chung, gom theo mối quan tâm — KHÔNG import modules/
│   │   ├── common.module.ts          # @Global: DRIZZLE · REDIS_CACHE · CacheService · SUPABASE_ADMIN · SupabaseJwtService; imports QueueRoot, Throttler
│   │   ├── auth/
│   │   │   ├── auth.guard.ts         # Bearer → JWKS → ensureProfile → req.user · bỏ qua @Public() · AUTH_USER port
│   │   │   ├── permission.guard.ts   # @RequirePermissions ↔ cache c9:perms:{id}
│   │   │   ├── supabase.ts           # SupabaseJwtService (jose + JWKS, ES256/RS256) · SUPABASE_ADMIN port + adapter
│   │   │   └── decorators.ts         # Public · RequirePermissions · CurrentUser
│   │   ├── database/
│   │   │   ├── drizzle.ts            # postgres.js + drizzle · geographyPoint customType · latLngToEwkt/ewkbToLatLng · DatabaseLifecycle
│   │   │   └── schema.ts             # barrel gom *.schema.ts của mọi module
│   │   ├── redis/
│   │   │   ├── cache.ts              # REDIS_CACHE db0 · redisOptions() · cacheKeys/TTL đang dùng · CacheService (5 thao tác)
│   │   │   ├── queue.ts              # BullModule.forRoot (db1, prefix c9) · QUEUES
│   │   │   └── throttler.guard.ts    # RedisThrottlerStorage (Lua) · AppThrottlerGuard tracker u:/d:/ip:
│   │   └── http/
│   │       ├── exceptions.ts         # ErrorCodes · AppException · AllExceptionsFilter → { error: { code, params, requestId } }
│   │       ├── response.ts           # ResponseInterceptor { data, meta: { requestId } }
│   │       ├── validation.ts         # APP_PIPE StandardSchemaValidationPipe (zod) → 422 VALIDATION_FAILED
│   │       ├── request-context.middleware.ts  # X-Instance-Id · X-Request-Id
│   │       └── express.d.ts          # req.user
│   └── modules/                      # nghiệp vụ — mỗi module 1 thư mục; file chính ở gốc, chỉ 2 thư mục con dto/ và schema/
│       ├── health/
│       │   ├── health.module.ts · health.controller.ts (GET /health/live · /health/ready) · health.indicators.ts
│       ├── identity/
│       │   ├── identity.module.ts
│       │   ├── identity.controller.ts        # GET/DELETE /api/v1/me
│       │   ├── identity-admin.controller.ts  # /admin/roles · /admin/users/:id/roles (@RequirePermissions('role:manage'))
│       │   ├── identity.service.ts           # ensureProfile · getMe · deleteMe · touchDevice · getPermissions · setUserRoles
│       │   ├── identity.repository.ts        # mọi SQL của identity (Drizzle)
│       │   ├── dto/                          # zod request/response — Swagger đọc tự động
│       │   │   ├── me.dto.ts                 # MeResponseSchema
│       │   │   └── role.dto.ts               # ROLE_CODES · RoleSchema · SetUserRolesSchema
│       │   └── schema/
│       │       └── identity.schema.ts        # profiles · roles · permissions · role_permissions · user_roles · devices
│       ├── pin/
│       │   ├── pin.module.ts · pin.constants.ts · pin.jobs.ts   # bước 7 thêm controller/service/repository/dto/schema
│       └── queue-board/
│           └── queue-board.module.ts # /admin/queues (Bull Board) + middleware JWT + queue:read; tắt khi test
├── drizzle/                          # 0000_extensions · 0001_identity · 0002_seed_rbac (SQL)
├── drizzle.config.ts                 # schema: 'src/**/*.schema.ts'
├── test/
│   ├── unit/*.spec.ts                # logic thuần, không hạ tầng (env · exceptions · drizzle · permission.guard)
│   ├── integration/*.spec.ts         # AppModule thật trên testcontainers (app · cross-cutting · geography · redis-queue · auth-rbac · supabase-real)
│   └── setup/{containers.ts, env.ts} # globalSetup testcontainers + migrate · setupFiles inject URL
├── scripts/                          # smoke-multi-instance.sh · dev-token.mjs · verify-auth.mjs
├── i18n/{vi,en}/*.json · openapi/{app,admin}.json
├── Dockerfile · docker-compose.yml · nginx.conf · vitest.config.ts · .env.example · .github/workflows/ci.yml
└── package.json · tsconfig.json · nest-cli.json
```

Nguồn: [ADR-0006](./adr/0006-all-in-one-cau-truc-don-gian.md) (sửa đổi 2026-09-17). Mobile (Flutter / React Native) là **repo riêng**, tiêu thụ `openapi.json`. Quy tắc file (theo quy ước Nest CLI `nest g resource` + rule `arch-feature-modules`):
- `modules/<x>/`: file chính ở gốc, tên bắt đầu bằng `<x>.` hoặc `<x>-`: `<x>.module|controller|service|repository|constants|jobs.ts`; `<x>-<sub>.controller.ts` cho nhóm route phụ (admin); `<x>-geo.repository.ts` cho SQL PostGIS. Chỉ 2 thư mục con: `dto/<tên>.dto.ts` (zod) và `schema/<x>.schema.ts` (Drizzle). Không tạo `controllers/ services/ repositories/`.
- `common/`: gom theo mối quan tâm `auth/ database/ redis/ http/`; thêm nhóm mới khi có ≥ 2 file cùng mối quan tâm. `config/` chỉ chứa cấu hình (env, logger, i18n, openapi), không logic nghiệp vụ.
- Test ngoài `src/`: `test/unit/` · `test/integration/` · `test/setup/`. `src/` không có `*.spec.ts`.
- **Không tạo thư mục rỗng**, không file wiring riêng (`api.module`, `worker.module`, `core.module` đã bỏ).

---

## 4. Quy ước đặt tên

| Loại | Quy ước | Ví dụ |
|---|---|---|
| File | kebab-case + hậu tố | `pin-geo.repository.ts` |
| Bảng Drizzle | `schema/<module>.schema.ts` | `schema/identity.schema.ts` |
| Zod DTO | `<module>.dto.ts` | `pin.dto.ts` |
| Processor + scheduler | `<module>.jobs.ts` | `pin.jobs.ts` |
| Class | PascalCase | `PinGeoRepository` |
| Bảng | snake_case số nhiều, schema `public` | `pin_photos` |
| Cột | snake_case | `created_at`, `sos_alerts_enabled` |
| Cột chuẩn | `id UUID v7`, `created_at`, `updated_at`, `deleted_at?` (soft delete khi cần) | |
| Route | kebab-case số nhiều, `/api/v1` | `/api/v1/pins/:id/votes` |
| Cache key | `c9:v1:{domain}:{id}` | `c9:v1:pin:abc` |
| Queue | `{domain}:{tier}` | `push:critical` |
| Event | `{domain}.{action}` | `pin.created` |
| Error code | SCREAMING_SNAKE | `PIN_DUPLICATE_NEARBY` |
| i18n key | `module.action.key` | `alert.push.pin_nearby.title` |
| Env | SCREAMING_SNAKE, validate zod lúc boot | `DATABASE_URL`, `REDIS_URL` |
| Env Supabase | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_ISSUER` | |
| Decorator auth | `@Public()`, `@RequirePermissions('pin.delete')`, `@RequirePhoneVerified()` | không còn `@AllowUnverified()` |
| Guard | `AuthGuard` → `PermissionGuard` → `PhoneVerifiedGuard` (thứ tự) | |
| Permission | `{domain}.{action}` | `pin.moderate`, `promoted.refund` |
| Header | `X-Request-Id`, `X-Instance-Id`, `x-device-id`, `Idempotency-Key` | |
| Commit | Conventional Commits | `feat(pin): viewport clustering` |
| Branch | trunk-based, feature branch ngắn | `feat/pin-viewport` |

---

## 5. Quy tắc module NestJS

| Thành phần | Quy tắc |
|---|---|
| `*.module.ts` | Chỉ `exports: [XService]`. Import module khác, không import file |
| `*.controller.ts` | Thin: parse DTO → gọi service → trả `{ data, meta }`. Không logic, không SQL |
| `*.service.ts` | Nghiệp vụ, transaction, ghi outbox trong cùng `tx`. Không `sql` template |
| `*.repository.ts` | Sở hữu mọi truy vấn Drizzle của module. Không gọi service |
| `*-geo.repository.ts` | Sở hữu mọi SQL PostGIS (`ST_DWithin`, cluster). Có test biên |
| `*.dto.ts` | Mọi zod schema request/response của module. Controller dùng `@Body({ schema })`; kiểu = `z.infer`. Không thư mục `dto/` |
| `*.schema.ts` | Bảng Drizzle của module; `drizzle.config.ts` gom bằng glob `src/**/*.schema.ts` |
| `*.constants.ts` | Hằng số nghiệp vụ (tuổi thọ pin, tier rep, rate limit) — một chỗ duy nhất |
| `*.jobs.ts` | `@Processor` + `upsertJobScheduler` (id cố định); chạy trên mọi instance |
| `*.types.ts` | Kiểu nội bộ module (chỉ khi cần) |
| Cross-module | Gọi service đã export, hoặc phát event qua outbox. Không join bảng module khác trong SQL |
| Guard/decorator | Chỉ khai báo trong `common/auth/` (`auth.guard.ts`, `permission.guard.ts`, `decorators.ts`). Module không tự viết guard |

---

## 6. Quy chuẩn tài liệu

Mọi file trong `docs/` tuân thủ:

| Quy tắc | Chi tiết |
|---|---|
| Tên file | kebab-case tiếng Anh; nội dung tiếng Việt, thuật ngữ giữ tiếng Anh |
| Header | `# Tiêu đề` → `**Cập nhật:** YYYY-MM-DD · **Trạng thái:** Draft/Active/Deprecated · **Chủ sở hữu:** PM/QA/Tech Lead` → 1 dòng mục đích → `---` |
| Cấu trúc | Mục đánh số `## 1.` / `### 1.1`. Bảng thay cho văn xuôi. Rule MUST/NEVER trong code block, keyword viết hoa, mỗi dòng một rule |
| Độ dài | ≤ 300 dòng. Dài hơn → tách file |
| Link | Tương đối `[text](./file.md)`. Mỗi sự thật ở đúng một file, chỗ khác link tới |
| Tên dự án | Repo/package `c9_map`, văn xuôi "C9 Map", cache prefix `c9:` |
| ADR | `docs/adr/NNNN-ten-quyet-dinh.md`, ≤ 30 dòng: Bối cảnh · Quyết định · Hệ quả · Ngày |

Mỗi file sở hữu gì:

| File | Sở hữu |
|---|---|
| `README.md` | Index tài liệu, quick start, stack 1 bảng |
| `docs/project-overview-pdr.md` | Sản phẩm: vòng lặp, loại pin, rep, badge, phạm vi MVP, pháp lý |
| `docs/system-architecture.md` | Kiến trúc + cấu hình từng tech (NestJS, Supabase, PG, Drizzle, Redis, BullMQ, i18n, Swagger, upload, log, Docker) |
| `docs/code-standards.md` | File này: nguyên tắc, cấu trúc, đặt tên, module, git |
| `docs/nestjs-guide.md` | docs.nestjs.com chắt lọc: dùng / tránh / vì sao, request lifecycle, gotchas |
| `docs/setup-strategy.md` | Chiến lược cấu hình: ràng buộc → cấu trúc → config từng tầng → thứ tự dựng → môi trường |
| `docs/project-structure-and-flows.md` | Cây file sau skeleton, bảng config có vì sao, sơ đồ luồng (mermaid) |
| `docs/project-roadmap.md` | Thứ tự dựng theo bước, giai đoạn, những gì không làm, tiến độ |
| `docs/testing-and-ci.md` | Tầng test, môi trường, pipeline, secrets |
| `docs/project-analysis.md` | Phân tích PM/QA/Tech Lead, mâu thuẫn README ↔ demo, rủi ro |
| `docs/decisions-pending.md` | Câu hỏi chưa chốt + khuyến nghị tạm; chốt xong → ADR |
| `docs/codebase-summary.md` | Hiện trạng repo, cập nhật sau mỗi bước scaffold |
| `docs/adr/` | Một file mỗi quyết định lớn đã chốt (0006 = cấu trúc thư mục hiện hành) |

---

## 7. Git

```
MUST   Conventional Commits: feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert(scope): subject
MUST   header ≤ 100 ký tự, subject lower-case / kebab-case
MUST   trunk-based: branch ngắn từ main, merge qua PR, xoá sau merge
MUST   lint trước commit, test trước push — NEVER bỏ qua test đỏ để qua CI
NEVER  commit .env, key, credential, dump DB
NEVER  ghi tham chiếu AI trong commit message hoặc PR
MUST   scope = tên module hoặc tầng: pin, alert, shared, docs, ci
```
