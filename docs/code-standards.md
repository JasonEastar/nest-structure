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
| **File < 200 dòng** | Tách theo trách nhiệm: controller / service / repository / jobs |
| **kebab-case + hậu tố** | Tên file tự mô tả mục đích, đọc được bằng `grep` mà không cần mở |
| **Không mock để qua test** | PostGIS, Redis, BullMQ test trên container thật. Xem [testing](./testing.md) |

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
MUST   code không giữ state trong RAM (Redis/Postgres); đa instance kiểm bằng test/integration/redis-queue.spec.ts (2 AppModule chung Redis)
```

Câu tự vấn khi viết bất kỳ biến nào: *"Instance 2 có cần biết cái này không?"* Có → ra ngoài process.

### 2.2 Ranh giới module

```
MUST   chia module theo nghiệp vụ (modules/pin/); trong module ≥ 2 nghiệp vụ mới xếp theo tầng controllers/ services/ repositories/ (§3)
MUST   @Module() chỉ export service — NEVER export repository
MUST   common/ không import từ modules/ (một chiều) — ngoại lệ duy nhất: common/database/schema.ts gom *.schema.ts cho Drizzle
MUST   @Processor là provider của module nghiệp vụ (pin.jobs.ts) — mọi instance chạy processor (all-in-one, ADR-0006)
NEVER  import trực tiếp file bên trong module khác (chỉ qua service đã export) — ngoại lệ: *.schema.ts (barrel Drizzle)
```

### 2.3 Dữ liệu

```
MUST   khoá chính UUID v7 (time-ordered) cho mọi bảng nghiệp vụ — ngoại lệ: seed tĩnh trong SQL (roles, permissions) dùng gen_random_uuid() public.*
MUST   TIMESTAMPTZ, luôn UTC — NEVER dùng TIMESTAMP không TZ
MUST   cột toạ độ: geography(Point, 4326) + index GIST
MUST   ST_DWithin cho tìm bán kính — NEVER ST_Distance(...) < x (không dùng index)
MUST   mọi SQL (kể cả PostGIS) nằm trong <x>.repository.ts — NEVER rải trong service
MUST   phân trang bằng cursor (created_at, id) — NEVER OFFSET
MUST   bảng user_locations: một dòng mỗi user, UPSERT — NEVER bảng lịch sử có GIST
MUST   notifications partition theo tháng
MUST   migration là bước riêng trong deploy — NEVER chạy lúc boot (drizzle migrate() không có lock, N instance sẽ đua)
MUST   *.schema.ts chỉ import drizzle-orm, util npm thuần (uuidv7) và *.schema.ts khác — NEVER import common/database/drizzle.ts hay service (cột dùng chung lấy từ common/database/columns.ts)
MUST   FK liên module một chiều (pin → user); MVP dùng db.select() + join — NEVER relations()/db.query
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
MUST   push_token (bước 11) gắn với bảng devices(user_id, device_id) — NEVER gắn trực tiếp vào profiles
MUST   strip EXIF (GPS) mọi ảnh trong job media trước khi public
NEVER  log: token, OTP, mật khẩu, toạ độ chính xác của user, nội dung riêng tư
NEVER  dùng SUPABASE_SECRET_KEY ở client hoặc trong log/response
```

### 2.5 API

```
MUST   MỌI response cùng 5 field { success, code, msg, data, meta }; lỗi: success=false, data=null, code là mã chữ (NEVER số HTTP), msg đã dịch theo Accept-Language, chi tiết trong meta từ i18n/<lang>/errors.json — NEVER hard-code câu chữ trong service
MUST   response shape DUY NHẤT cho cả thành công lẫn lỗi: { success, code, msg, data, meta }
MUST   AuthGuard global; route mở dùng @Public()
MUST   route cần quyền có @RequirePermission('<resource>:<action>') — mã lấy từ `common/auth/permissions.ts` (gõ sai = lỗi compile), seed trong drizzle/*.sql; quyền nằm trong DB + Redis, NEVER trong JWT
MUST   SOS (gđ 2) có @RequirePhoneVerified() — không global; MVP đăng nhập chỉ Google, không cần SĐT
MUST   rate limit khoá theo IP (req.ip sau `trust proxy`), đếm chung mọi instance qua Redis
MUST   POST tạo tài nguyên nhạy cảm (SOS, thanh toán, pin, reply) nhận Idempotency-Key
MUST   /api/v1 prefix
MUST   mọi response có X-Request-Id
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
│   ├── instrument.ts                 # Sentry.init khi có SENTRY_DSN; nạp bằng `node --import` trước app
│   ├── main.ts                       # điểm vào server: createApp → Swagger UI → listen
│   ├── app.ts                        # createApp(): helmet · trust proxy · prefix /api · version v1 · shutdown hooks (dùng chung với openapi-export)
│   ├── app.module.ts                 # imports ConfigModule + CommonModule + modules; providers APP_GUARD Throttler → Auth → Permission · APP_PIPE · APP_FILTER · APP_INTERCEPTOR
│   ├── openapi-export.ts             # `npm run openapi:export` → openapi/<key>.json mỗi định nghĩa (users, locations, health)
│   ├── config/                       # cấu hình app — không nghiệp vụ, không hạ tầng
│   │   ├── env.ts                    # zod schema; ConfigModule đọc .env + validate, dùng qua ConfigService
│   │   ├── logger.ts                 # nestjs-pino: genReqId · redact · bỏ log /health
│   │   ├── i18n.ts                   # nestjs-i18n vi/en, resolver Accept-Language
│   │   └── openapi.ts                # định nghĩa theo module (OPENAPI_DOCS) · tự ghi quyền/public · envelope() · exportOpenApi()
│   ├── common/                       # hạ tầng dùng chung, gom theo mối quan tâm — KHÔNG import modules/
│   │   ├── common.module.ts          # @Global: DRIZZLE · REDIS_CACHE · CacheService · SUPABASE_ADMIN · SupabaseJwtService; imports QueueRoot, Throttler
│   │   ├── auth/
│   │   │   ├── auth.guard.ts         # Bearer → JWKS → ensureProfile → req.user · bỏ qua @Public() · AUTH_USER port
│   │   │   ├── permission.guard.ts   # @RequirePermission ↔ cache c9:v1:user:perms:{id}
│   │   │   ├── supabase.ts           # SupabaseJwtService (jose + JWKS, ES256/RS256) · SUPABASE_ADMIN port + adapter
│   │   │   └── decorators.ts         # Public · RequirePermission · CurrentUser
│   │   ├── database/
│   │   │   ├── drizzle.ts            # provider DRIZZLE (postgres.js + drizzle client)
│   │   │   ├── columns.ts            # cột dùng chung cho *.schema.ts: timestamps · uuidV7Pk · geographyPoint (lat/lng ↔ EWKT/EWKB)
│   │   │   └── schema.ts             # barrel gom *.schema.ts của mọi module
│   │   ├── redis/
│   │   │   ├── redis.provider.ts     # provider REDIS_CACHE (db0) · redisOptions()
│   │   │   ├── cache.ts              # cacheEntry(module, name, ttl) · CacheService (5 thao tác); key của module khai ở <x>.constants.ts
│   │   │   ├── queue.ts              # BullModule.forRoot (db1, prefix c9) · QUEUES
│   │   │   └── throttler.guard.ts    # RedisThrottlerStorage (Lua) · AppThrottlerGuard khoá theo IP (req.ip)
│   │   └── http/
│   │       ├── exceptions.ts         # ErrorCodes · AppException · AllExceptionsFilter → { success:false, code, msg, data:null, meta }
│   │       ├── response.ts           # ResponseInterceptor → { success, code, msg, data, meta }
│   │       ├── pagination.ts         # cursor (created_at, id) · PaginationQuerySchema · pageOf()
│   │       ├── validation.ts         # APP_PIPE StandardSchemaValidationPipe (zod) → 422 · zText · zLatLng
│   │       ├── request-context.middleware.ts  # X-Request-Id
│   │       └── express.d.ts          # req.user
│   └── modules/                      # nghiệp vụ — mỗi module 1 thư mục; file chính ở gốc, chỉ 2 thư mục con dto/ và schema/
│       ├── health/
│       │   ├── health.module.ts · health.controller.ts (GET /health/live · /health/ready) · health.indicators.ts
│       ├── user/                     # 2 nghiệp vụ (user · role) → xếp theo tầng; dto/ schema/ constants dùng chung ở gốc
│       │   ├── user.module.ts
│       │   ├── user.constants.ts         # ROLE_CODES · USER_STATUSES · USER_LIMITS · PASSWORD_LENGTH · USER_CACHE
│       │   ├── schema/user.schema.ts     # profiles (status active|blocked) · roles · permissions · role_permissions · user_roles
│       │   ├── dto/                      # me · update-me · admin-user · role
│       │   ├── controllers/
│       │   │   ├── user.controller.ts     # UserController /me · UserAdminController /admin/users (cùng dữ liệu, khác quyền)
│       │   │   └── role.controller.ts        # /admin/roles · /admin/users/:id/roles
│       │   ├── services/
│       │   │   ├── user.service.ts        # AUTH_USER cho guard (ensureProfile, getPermissions) · /me · /admin/users
│       │   │   └── role.service.ts           # listRoles · listUserRoles · setUserRoles (xoá cache quyền)
│       │   └── repositories/
│       │       ├── user.repository.ts     # SQL profiles
│       │       └── role.repository.ts        # SQL roles · role_permissions · user_roles
│       ├── location/                 # MODULE MẪU — copy cấu trúc này cho module mới
│       │   ├── location.module.ts · location.controller.ts · location.service.ts · location.repository.ts · location.constants.ts
│       │   ├── dto/create-location.dto.ts · dto/location.dto.ts     # 1 file / use case, chứa cả request + response
│       │   └── schema/location.schema.ts                          # saved_locations (geography + GIST)
├── drizzle/                          # 0000_extensions · 0001_identity · 0002_seed_rbac · 0003_location · 0004_location-public
├── drizzle.config.ts                 # schema: 'src/**/*.schema.ts'
├── test/
│   ├── unit/*.spec.ts                # logic thuần, không hạ tầng (env · exceptions · columns · permission.guard · pagination · validation · location.service)
│   ├── integration/*.spec.ts         # AppModule thật trên testcontainers (app · cross-cutting · geography · redis-queue · auth-rbac · location · supabase-real)
│   └── setup/{containers,env,jwks}.ts # globalSetup testcontainers + migrate · setupFiles inject URL · Supabase JWKS giả (ES256)
├── scripts/                          # dev-token.mjs (token Supabase thật) · grant-role.mjs (admin đầu tiên)
├── i18n/{vi,en}/*.json · openapi/{system,users,locations}.json
├── docker-compose.yml (postgres · redis · redis-insight cho dev) · vitest.config.ts · .env.example
└── package.json · tsconfig.json · nest-cli.json
```

Nguồn: [ADR-0006](./adr/0006-all-in-one-cau-truc-don-gian.md) (sửa đổi 2026-09-17). Mobile (Flutter / React Native) là **repo riêng**, tiêu thụ `openapi.json`. Quy tắc file (theo quy ước Nest CLI `nest g resource` + rule `arch-feature-modules`):
- `modules/<x>/` **một nghiệp vụ** (location, app-config, health): phẳng — `<x>.module|controller|service|repository|constants.ts` + `dto/` + `schema/`. Route public = class `<X>PublicController` (`@Public()`, path `public/<x>`), route quản trị = class `<X>AdminController` (path `admin/...`), cả hai trong CÙNG `<x>.controller.ts`, phân đoạn bằng comment. **Mẫu chuẩn: `modules/location/`** — module mới copy y hệt.
- `modules/<x>/` **≥ 2 nghiệp vụ** (user: user + role): gốc giữ thứ dùng chung (`<x>.module.ts`, `<x>.constants.ts`, `schema/`, `dto/`); code xếp theo tầng `controllers/ services/ repositories/`, mỗi nghiệp vụ một file trong mỗi tầng (`user.service.ts`, `role.service.ts`). Chọn kiểu này (2026-09-21) vì nhìn theo tầng dễ hơn; đổi ý sau này chỉ là di chuyển file, import không đổi nghĩa. Không để một nghiệp vụ ở gốc, một trong thư mục. 
- `dto/<use-case>.dto.ts`: một file cho một use case, chứa CẢ schema request lẫn response của use case đó, kèm mapper `toXxxResponse(row)` ngay dưới response schema (service không tự ghép object) (`create-location.dto.ts` có `CreateLocationSchema`; `location.dto.ts` có `LocationResponseSchema` + query schema). **Không** tách `dto/requests/` và `dto/responses/`: request và response của cùng API phải đọc cạnh nhau; Swagger đọc zod trực tiếp nên không cần class riêng cho mỗi chiều.
- **Mở rộng module** (bảng phụ, route phụ) và **nối hai module** (FK một chiều, join khi đọc, gọi service khi ghi, không inject repository của module khác, không `forwardRef`): quy trình 5 bước và ví dụ post ↔ location ở [code-walkthrough.md §8](./code-walkthrough.md).
- **Tách theo nghiệp vụ, không theo quyền gọi:** `/me` và `/admin/users` cùng là *user* (một dữ liệu, khác permission) → cùng `user.*`, hai class trong một controller; *role* là nghiệp vụ khác → `role.*`. Repository tách theo bảng sở hữu (`user.repository` = profiles, `role.repository` = roles · role_permissions · user_roles); service cần bảng khác thì inject repository đó. Không tạo `admin-*.ts`.
- **Ít file hơn là tốt hơn:** chỉ tách file khi khác nghiệp vụ con hoặc vượt ~150–200 dòng; trong file dùng comment `// ---- ... ----` chia đoạn. Giải thích cấu trúc bằng comment, không bằng thêm file.
- **Khi dự án lớn:** module có ≥ 2 nghiệp vụ → `controllers/ services/ repositories/` như trên; nghiệp vụ con được module khác dùng nhiều hoặc có vòng đời riêng → tách thành module mới, mỗi module chỉ export service module khác cần. Vượt ~15 module → nhóm theo miền trong `modules/` (`modules/map/{pin,location}`, `modules/community/{vote,report}`), đường import đổi nhưng cấu trúc bên trong module giữ nguyên.
- `common/`: gom theo mối quan tâm `auth/ database/ redis/ http/`; thêm nhóm mới khi có ≥ 2 file cùng mối quan tâm. `config/` chỉ chứa cấu hình (env, logger, i18n, openapi), không logic nghiệp vụ.
- Test ngoài `src/`: `test/unit/` · `test/integration/` · `test/setup/`. `src/` không có `*.spec.ts`.
- **Không tạo thư mục rỗng**, không file wiring riêng (`api.module`, `worker.module`, `core.module` đã bỏ).

---

## 4. Quy ước đặt tên

| Loại | Quy ước | Ví dụ |
|---|---|---|
| File | kebab-case + hậu tố | `location.repository.ts` |
| Bảng Drizzle | `schema/<module>.schema.ts` | `schema/user.schema.ts` |
| Zod DTO | `<module>.dto.ts` | `pin.dto.ts` |
| Processor + scheduler | `<module>.jobs.ts` | `pin.jobs.ts` |
| Class | PascalCase | `PinGeoRepository` |
| Bảng | snake_case số nhiều, schema `public` | `pin_photos` |
| Cột | snake_case | `created_at`, `sos_alerts_enabled` |
| Cột chuẩn | `id UUID v7`, `created_at`, `updated_at`, `deleted_at?` (soft delete khi cần) | |
| Route | kebab-case số nhiều, `/api/v1` | `/api/v1/pins/:id/votes` |
| Cache key | `c9:v1:{module}:{name}:{id}` qua `cacheEntry` | `c9:v1:user:perms:{userId}`, `c9:v1:pin:viewport:{tile}` |
| Queue | `{domain}:{tier}` | `push:critical` |
| Event | `{domain}.{action}` | `pin.created` |
| Error code | SCREAMING_SNAKE | `PIN_DUPLICATE_NEARBY` |
| i18n key | `module.action.key` | `alert.push.pin_nearby.title` |
| Env | SCREAMING_SNAKE, validate zod lúc boot | `DATABASE_URL`, `REDIS_URL` |
| Env Supabase | `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (backend); `SUPABASE_PUBLISHABLE_KEY` chỉ client/script | |
| Decorator auth | `@Public()`, `@RequirePermission('pin:delete_any')`, `@RequirePhoneVerified()` | không còn `@AllowUnverified()` |
| Guard | `AppThrottlerGuard` → `AuthGuard` → `PermissionGuard` (thứ tự trong app.module.ts) | |
| Permission | `resource:action`, action chuẩn `read · create · update · delete` + động từ nghiệp vụ (`ban`, `assign`, `review`); khai trong `common/auth/permissions.ts` | `pin:create`, `user:read`, `role:assign` |
| Header | `X-Request-Id`, `Idempotency-Key` (sau) | |
| Commit | Conventional Commits | `feat(pin): viewport clustering` |
| Branch | trunk-based, feature branch ngắn | `feat/pin-viewport` |

---

## 5. Quy tắc module NestJS

| Thành phần | Quy tắc |
|---|---|
| `*.module.ts` | Chỉ `exports: [XService]`. Import module khác, không import file |
| `*.controller.ts` | Thin: parse DTO → gọi service → trả dữ liệu thuần (interceptor bọc thành `{ success, code, msg, data, meta }`). Không logic, không SQL |
| `*.service.ts` | Nghiệp vụ, transaction, ghi outbox trong cùng `tx`. Không `sql` template |
| `*.repository.ts` | Sở hữu mọi truy vấn Drizzle của module. Không gọi service |
| `<x>.repository.ts` | Sở hữu mọi SQL của module, kể cả PostGIS (`ST_DWithin`). SQL không gian phải có test biên |
| `*.dto.ts` | Mọi zod schema request/response của module. Controller dùng `@Body({ schema })`; kiểu = `z.infer`. dto đặt trong `dto/<use-case>.dto.ts` |
| `*.schema.ts` | Bảng Drizzle của module; `drizzle.config.ts` gom bằng glob `src/**/*.schema.ts` |
| `*.constants.ts` | Hằng số nghiệp vụ **của module** (giới hạn, enum: `ROLE_CODES`, `USER_STATUSES`) và mục cache của module (`USER_CACHE = { perms: cacheEntry('user', 'perms', 300) }`; chỉ chạm key của mình, vô hiệu cache module khác qua service của nó) — một chỗ duy nhất. Hằng số **toàn app** (rate limit, `LOCALES`) ở `src/config/` |
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
| `docs/project-roadmap.md` | Thứ tự dựng theo bước, giai đoạn, những gì không làm, tiến độ |
| `docs/testing.md` | Tầng test, kịch bản, môi trường, secrets (CI/CD: chưa có, cố ý) |
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
