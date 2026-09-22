# Hiện trạng codebase — C9 Map

**Cập nhật:** 2026-09-22 · **Trạng thái:** Active · **Chủ sở hữu:** Tech Lead
Ảnh chụp repo tại thời điểm cập nhật. Cập nhật sau mỗi bước trong [project-roadmap.md](./project-roadmap.md).

---

## 1. Trạng thái

| Mục | Giá trị |
|---|---|
| Roadmap | Bước 0–6 ✅ (skeleton + auth + RBAC + test). CI/Docker image/deploy gỡ 2026-09-21 (chỉ dev). Tiếp theo: bước 7 Pin core, chưa lập plan |
| Module | `health`, `user` (/me xem/sửa/xoá, /admin/users tạo–danh sách–khoá, /admin/roles), `location` (module mẫu: CRUD + public nearby PostGIS), `app-config` (config động trong DB: /public/configs cho client, /admin/configs CRUD; seed `system_enums`). BullMQ đã cấu hình, chưa có queue nào đăng ký |
| Test | 93 (unit 48 · integration 45) trên PostGIS + Redis thật (testcontainers); mọi endpoint đã đối chiếu shape response; không có CI |
| API | Một shape response duy nhất `{ success, code, msg, data, meta }`; Swagger `/docs` chia theo module, `openapi/{system,users,locations}.json` |
| Git | Nhánh `main`, lịch sử gom lại 2026-09-21: bootstrap → feat(user) → feat(location) → feat(app-config) → chore/refactor dọn dev-only |
| Kế hoạch | `plans/260916-1500-c9-map-backend-skeleton/` ✅ · `plans/260917-1000-restructure-src-layout/` ✅ · `plans/260917-1130-location-reference-module/` ✅ |

## 2. Cây thư mục hiện tại

```
c9_backend/
├── CLAUDE.md                 # hướng dẫn Claude Code (ClaudeKit + mục C9 Map)
├── README.md                 # điểm vào, mục lục tài liệu
├── docs/                     # tài liệu dự án (quy chuẩn: code-standards.md §6)
│   ├── adr/                  # 0001 tên, 0002 Supabase auth, 0003 bỏ social, 0004 polling, 0005 Postgres riêng, 0006 all-in-one + cấu trúc
│   ├── archive/              # brief gốc
│   ├── code-walkthrough.md · api-cookbook.md   # 2 file người mới đọc trước
│   ├── project-overview-pdr.md · system-architecture.md · code-standards.md
│   ├── project-roadmap.md · testing.md · project-analysis.md
│   ├── decisions-pending.md · codebase-summary.md · nestjs-guide.md · archive/ (setup-strategy, readme gốc)
├── plans/
│   ├── reports/              # researcher-260916-*.md (Supabase, stack), nestjs-docs-01..04-*.md (toàn bộ docs.nestjs.com)
│   └── 260916-1500-c9-map-backend-skeleton/   # plan.md + phase-01..07
├── demo-html/                # prototype 30 màn hình + overview gốc (MapChat Live)
├── guide/                    # tài liệu ClaudeKit (COMMANDS, SKILLS, claudekit/ docs boilerplate cũ)
├── docs-vi/                  # hướng dẫn ClaudeKit tiếng Việt (không phải tài liệu dự án)
└── .claude/                  # agents, commands, skills, workflows của ClaudeKit
```

## 3. Code hiện có (phase 01–07, cấu trúc sửa đổi 2026-09-17)

```
c9_map/
├── src/
│   ├── instrument.ts                 # Sentry.init khi có SENTRY_DSN; nạp bằng `node --import` trước app
│   ├── main.ts                       # điểm vào server: createApp → Swagger UI → listen
│   ├── app.ts                        # createApp(): helmet · trust proxy · prefix /api · version v1 · shutdown hooks (dùng chung với openapi-export)
│   ├── app.module.ts                 # imports ConfigModule + CommonModule + modules; providers APP_GUARD Throttler → Auth → Permission · APP_PIPE · APP_FILTER · APP_INTERCEPTOR
│   ├── openapi-export.ts             # `npm run openapi:export` → openapi/<key>.json mỗi định nghĩa (users, locations, health)
│   ├── config/                       # cấu hình app — không nghiệp vụ, không hạ tầng
│   │   ├── rate-limit.ts             # RATE_LIMIT (10/giây · 300/phút mỗi IP mỗi route), RATE_LIMIT_TEST — chính sách toàn app, không phải env
│   │   ├── env.ts                    # zod schema; ConfigModule đọc .env + validate, dùng qua ConfigService
│   │   ├── logger.ts                 # nestjs-pino → stdout (Sentry tự bắt qua pinoIntegration) · redact · bỏ log /health
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
│   │       ├── exceptions.ts         # ErrorCodes (11 mã dùng chung theo HTTP status) · AppException · validationError · AllExceptionsFilter → { success:false, code, msg, data:null, meta }
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
│       │   ├── user.constants.ts         # SYSTEM_ROLE (user · admin) · ROLE_CODE · USER_STATUSES · USER_LIMITS · PASSWORD_LENGTH · USER_CACHE
│       │   ├── schema/user.schema.ts     # profiles (status active|blocked) · roles · permission_groups · permissions (group_id) · role_permissions · user_roles
│       │   ├── dto/                      # me · update-me · admin-user · role · permission
│       │   ├── controllers/
│       │   │   ├── user.controller.ts     # UserController /me · UserAdminController /admin/users (cùng dữ liệu, khác quyền)
│       │   │   ├── role.controller.ts        # /admin/roles CRUD · /admin/users/:id/roles (tag Roles)
│       │   │   └── permission.controller.ts  # /admin/permissions CRUD theo id, sửa được cả code · /admin/permission-groups CRUD (tag Permissions)
│       │   ├── services/
│       │   │   ├── user.service.ts        # AUTH_USER cho guard (ensureProfile, getPermissions) · /me · /admin/users
│       │   │   ├── role.service.ts           # CRUD role (hệ thống không xoá, đang gán 409) · setUserRoles · resolveRoleIds (mã lạ 422) · xoá cache quyền user mang role
│       │   │   └── permission.service.ts     # permission theo nhóm (luôn thuộc 1 nhóm) · CRUD permission (đang gán 409) · CRUD nhóm (còn permission 409)
│       │   └── repositories/
│       │       ├── user.repository.ts     # SQL profiles
│       │       ├── role.repository.ts        # SQL roles · role_permissions · user_roles
│       │       └── permission.repository.ts  # SQL permission_groups · permissions (description, group_id)
│       ├── app-config/               # config động trong DB (bảng app_configs): /public/configs cho client · /admin/configs CRUD (config:*)
│       │   ├── app-config.module.ts · app-config.controller.ts (Public + Admin) · app-config.service.ts · app-config.repository.ts · app-config.constants.ts
│       │   ├── dto/config.dto.ts         # ConfigsQuerySchema (names không bắt buộc) · UpsertConfigSchema · AppConfigSchema
│       │   └── schema/app-config.schema.ts
│       └── location/                 # MODULE MẪU — copy cấu trúc này cho module mới
│       │   ├── location.module.ts · location.controller.ts · location.service.ts · location.repository.ts · location.constants.ts
│       │   ├── dto/create-location.dto.ts · dto/location.dto.ts     # 1 file / use case, chứa cả request + response
│       │   └── schema/location.schema.ts                          # saved_locations (geography + GIST)
├── drizzle/                          # 0000_extensions (postgis) · 0001_init (mọi bảng, từ schema) · 0002_seed (role, nhóm, permission, system_enums) — gộp lại 2026-09-22, DB dev reset
├── drizzle.config.ts                 # schema: 'src/**/*.schema.ts'
├── test/
│   ├── unit/*.spec.ts                # logic thuần, không hạ tầng (env · exceptions · columns · permission.guard · permissions · pagination · validation · location.service · user.service · role.service)
│   ├── integration/*.spec.ts         # AppModule thật trên testcontainers (app · cross-cutting · geography · redis-queue · auth-rbac · location · app-config · supabase-real)
│   └── setup/{containers,env,jwks}.ts # globalSetup testcontainers + migrate · setupFiles inject URL · Supabase JWKS giả (ES256)
├── scripts/                          # dev-token.mjs (token Supabase thật) · grant-role.mjs (admin đầu tiên)
├── i18n/{vi,en}/{errors,validation}.json · openapi/{system,users,locations}.json
├── docker-compose.yml (postgres · redis · redis-insight cho dev) · vitest.config.ts · .env.example
└── package.json · tsconfig.json · nest-cli.json
```
Scaffold `nest new` 12: ESM (`type: module`, nodenext), oxlint, Vitest 4, TypeScript 6. Lệnh: xem bảng trong [README](../README.md#lệnh); thêm `node scripts/dev-token.mjs` (token thật) · `node scripts/grant-role.mjs <email> admin` (admin đầu tiên) · `npm run dev:tools` (RedisInsight).

## 4. Tiếp theo (roadmap bước 7 Pin core)

`modules/pin/` theo mẫu `location/` (schema, repository geo, service, controller, dto/), migration `markers` + `marker_photos`, test geo biên 300 m trên PostGIS thật, presigned upload R2 (decisions-pending).

## 5. Công cụ local đã kiểm tra

Node 24.14 (Docker dùng 22 LTS) · npm 11.9 · Docker 28.2 + Compose 2.37 · Supabase CLI 2.90 · psql · image `postgis/postgis:16-3.4` và `redis:7.4` đã có sẵn.
