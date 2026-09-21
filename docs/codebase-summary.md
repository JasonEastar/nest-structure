# Hiện trạng codebase — C9 Map

**Cập nhật:** 2026-09-18 · **Trạng thái:** Active · **Chủ sở hữu:** Tech Lead
Ảnh chụp repo tại thời điểm cập nhật. Cập nhật sau mỗi bước trong [project-roadmap.md](./project-roadmap.md).

---

## 1. Trạng thái

| Mục | Giá trị |
|---|---|
| Roadmap | Bước 0–6 ✅ (skeleton + auth + RBAC + test). CI/Docker image/deploy gỡ 2026-09-21 (chỉ dev). Tiếp theo: bước 7 Pin core, chưa lập plan |
| Module | `health`, `user` (/me xem/sửa/xoá, /admin/users tạo–danh sách–khoá, /admin/roles), `location` (module mẫu: CRUD + public nearby PostGIS), `app-config` (/public/configs: enum + nhãn đa ngôn ngữ cho client), `queue-board` (Bull Board). Chưa có queue nào đăng ký |
| Test | 91 (unit 46 · integration 45) trên PostGIS + Redis thật (testcontainers); mọi endpoint đã đối chiếu shape response; không có CI |
| API | Một shape response duy nhất `{ success, code, msg, data, meta }`; Swagger `/docs` chia theo module, `openapi/{users,configs,locations,health}.json` |
| Git | Nhánh `main`, 41 commit tới 2026-09-18. Mốc: 7469607 phase 07 · 9e00612 cấu trúc mới · 26d30ee module mẫu location · 33253c3 identity → user · 2d45e4b đơn giản hoá theo chuẩn NestJS · 72517cf format response thống nhất |
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
│   │   ├── env.ts                    # zod schema; ConfigModule đọc .env + validate, dùng qua ConfigService
│   │   ├── logger.ts                 # nestjs-pino → stdout (Sentry tự bắt qua pinoIntegration) · redact · bỏ log /health
│   │   ├── i18n.ts                   # nestjs-i18n vi/en, resolver Accept-Language
│   │   └── openapi.ts                # định nghĩa theo module (OPENAPI_DOCS) · tự ghi quyền/public · envelope() · exportOpenApi()
│   ├── common/                       # hạ tầng dùng chung, gom theo mối quan tâm — KHÔNG import modules/
│   │   ├── common.module.ts          # @Global: DRIZZLE · REDIS_CACHE · CacheService · SUPABASE_ADMIN · SupabaseJwtService; imports QueueRoot, Throttler
│   │   ├── auth/
│   │   │   ├── auth.guard.ts         # Bearer → JWKS → ensureProfile → req.user · bỏ qua @Public() · AUTH_USER port
│   │   │   ├── permission.guard.ts   # @RequirePermission ↔ cache c9:perms:{id}
│   │   │   ├── supabase.ts           # SupabaseJwtService (jose + JWKS, ES256/RS256) · SUPABASE_ADMIN port + adapter
│   │   │   ├── permissions.ts        # PERMISSIONS (nguồn duy nhất, type Permission) · hasPermission
│   │   │   └── decorators.ts         # Public · RequirePermission · CurrentUser
│   │   ├── database/
│   │   │   ├── drizzle.ts            # provider DRIZZLE (postgres.js + drizzle client)
│   │   │   ├── columns.ts            # cột dùng chung cho *.schema.ts: timestamps · uuidV7Pk · geographyPoint (lat/lng ↔ EWKT/EWKB)
│   │   │   └── schema.ts             # barrel gom *.schema.ts của mọi module
│   │   ├── redis/
│   │   │   ├── redis.provider.ts     # provider REDIS_CACHE (db0) · redisOptions()
│   │   │   ├── cache.ts              # CACHE (key + ttl từng mục) · CacheService (5 thao tác)
│   │   │   ├── queue.ts              # BullModule.forRoot (db1, prefix c9) · QUEUES
│   │   │   └── throttler.guard.ts    # RedisThrottlerStorage (Lua) · AppThrottlerGuard khoá theo IP (req.ip)
│   │   └── http/
│   │       ├── exceptions.ts         # ErrorCodes · AppException · AllExceptionsFilter → { success:false, code, msg, data:null, meta }
│   │       ├── response.ts           # ResponseInterceptor → { success, code, msg, data, meta }
│   │       ├── pagination.ts         # cursor (created_at, id) · PaginationQuerySchema · pageOf()
│   │       ├── validation.ts         # APP_PIPE StandardSchemaValidationPipe (zod) → 422 · zText · zLatLng
│   │       ├── request-context.middleware.ts  # X-Instance-Id · X-Request-Id
│   │       └── express.d.ts          # req.user
│   └── modules/                      # nghiệp vụ — mỗi module 1 thư mục; file chính ở gốc, chỉ 2 thư mục con dto/ và schema/
│       ├── health/
│       │   ├── health.module.ts · health.controller.ts (GET /health/live · /health/ready) · health.indicators.ts
│       ├── user/
│       │   ├── user.module.ts
│       │   ├── user.controller.ts        # UserController /me · UserAdminController /admin/users (tạo, danh sách, chi tiết, khoá) · RoleAdminController /admin/roles, /admin/users/:id/roles
│       │   ├── user.service.ts           # ensureProfile (chặn blocked) · getMe · updateMe · createUser · listUsers · getUser · setUserStatus · deleteMe · touchDevice · getPermissions · setUserRoles
│       │   ├── user.repository.ts        # mọi SQL của user (Drizzle)
│       │   ├── user.constants.ts         # USER_LIMITS · LOCALES · USER_STATUSES · PASSWORD_LENGTH
│       │   ├── dto/                          # zod request/response — Swagger đọc tự động
│       │   │   ├── me.dto.ts                 # MeResponseSchema
│       │   │   ├── admin-user.dto.ts         # CreateUserSchema · ListUsersQuerySchema · SetUserStatusSchema · AdminUserSchema
│       │   │   ├── update-me.dto.ts          # UpdateMeSchema (PATCH /me, partial + null để xoá; không có username)
│       │   │   └── role.dto.ts               # ROLE_CODES · RoleSchema · SetUserRolesSchema
│       │   └── schema/
│       │       └── user.schema.ts        # profiles (status active|blocked) · roles · permissions · role_permissions · user_roles · devices
│       ├── app-config/               # GET /public/configs?names=system_enums — enum từ code + nhãn i18n/<lang>/enums.json mọi ngôn ngữ
    │   ├── app-config.module.ts · app-config.controller.ts · app-config.service.ts · app-config.constants.ts (SYSTEM_ENUMS, CONFIG_NAMES) · dto/config.dto.ts
    ├── location/                 # MODULE MẪU — copy cấu trúc này cho module mới
│       │   ├── location.module.ts · location.controller.ts · location.service.ts · location.repository.ts · location.constants.ts
│       │   ├── dto/create-location.dto.ts · dto/location.dto.ts     # 1 file / use case, chứa cả request + response
│       │   └── schema/location.schema.ts                          # saved_locations (geography + GIST)
│       └── queue-board/
│           └── queue-board.module.ts # /admin/queues (Bull Board) + middleware JWT + queue:read; tắt khi test
├── drizzle/                          # 0000_extensions · 0001_identity · 0002_seed_rbac · 0003_location · 0004_location-public
├── drizzle.config.ts                 # schema: 'src/**/*.schema.ts'
├── test/
│   ├── unit/*.spec.ts                # logic thuần, không hạ tầng (env · exceptions · columns · permission.guard · pagination · validation · location.service)
│   ├── integration/*.spec.ts         # AppModule thật trên testcontainers (app · cross-cutting · geography · redis-queue · auth-rbac · location · supabase-real)
│   └── setup/{containers,env,jwks}.ts # globalSetup testcontainers + migrate · setupFiles inject URL · Supabase JWKS giả (ES256)
├── scripts/                          # dev-token.mjs (token Supabase thật) · grant-role.mjs (admin đầu tiên)
├── i18n/{vi,en}/*.json · openapi/{users,configs,locations,health}.json
├── docker-compose.yml (postgres · redis · redis-insight cho dev) · vitest.config.ts · .env.example
└── package.json · tsconfig.json · nest-cli.json
```
Scaffold `nest new` 12: ESM (`type: module`, nodenext), oxlint, Vitest 4, TypeScript 6. Lệnh: xem bảng trong [README](../README.md#lệnh); thêm `node scripts/dev-token.mjs` (token thật) · `node scripts/grant-role.mjs <email> admin` (admin đầu tiên) · `npm run dev:tools` (RedisInsight).

## 4. Tiếp theo (roadmap bước 7 Pin core)

`modules/pin/` theo mẫu `location/` (schema, repository geo, service, controller, dto/), migration `markers` + `marker_photos`, test geo biên 300 m trên PostGIS thật, presigned upload R2 (decisions-pending).

## 5. Công cụ local đã kiểm tra

Node 24.14 (Docker dùng 22 LTS) · npm 11.9 · Docker 28.2 + Compose 2.37 · Supabase CLI 2.90 · psql · image `postgis/postgis:16-3.4` và `redis:7.4` đã có sẵn.
