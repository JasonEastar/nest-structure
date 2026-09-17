# Hiện trạng codebase — C9 Map

**Cập nhật:** 2026-09-17 · **Trạng thái:** Active · **Chủ sở hữu:** Tech Lead
Ảnh chụp repo tại thời điểm cập nhật. Cập nhật sau mỗi bước trong [project-roadmap.md](./project-roadmap.md).

---

## 1. Trạng thái

| Mục | Giá trị |
|---|---|
| Bước roadmap | Skeleton 7/7 phase xong (roadmap bước 0–6 ✅): test unit/integration testcontainers, smoke đa instance, CI GitHub Actions; tiếp theo roadmap bước 7 Pin core |
| Git | Nhánh `main`; e7f5f1a docs · f1476f4 phase 01 · 55d3858 phase 02 · fb5db5f phase 03 · 2f6ffc1 phase 04 · 6d3a5b6 phase 05 · 654527c phase 06 · 343b23f verify auth thật · 7469607 phase 07 test/CI · 9e00612 sắp xếp lại cấu trúc · 8b1b2c6 tinh giản YAGNI + code-walkthrough · module mẫu location (2026-09-17) |
| Kế hoạch | `plans/260916-1500-c9-map-backend-skeleton/` ✅ hoàn thành; plan bước 7 (pin core) chưa lập |

## 2. Cây thư mục hiện tại

```
c9_backend/
├── CLAUDE.md                 # hướng dẫn Claude Code (ClaudeKit + mục C9 Map)
├── README.md                 # điểm vào, mục lục tài liệu
├── docs/                     # tài liệu dự án (quy chuẩn: code-standards.md §6)
│   ├── adr/                  # 0001 tên, 0002 Supabase auth, 0003 bỏ social, 0004 polling, 0005 Postgres riêng, 0006 all-in-one + cấu trúc
│   ├── archive/              # brief gốc
│   ├── project-overview-pdr.md · system-architecture.md · code-standards.md
│   ├── project-roadmap.md · testing-and-ci.md · project-analysis.md
│   ├── decisions-pending.md · codebase-summary.md · nestjs-guide.md · setup-strategy.md · project-structure-and-flows.md
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
│   ├── main.ts                       # điểm vào server: load-env → createApp → Swagger UI → listen
│   ├── app.ts                        # createApp(): helmet · trust proxy · prefix /api · version v1 · shutdown hooks (dùng chung với openapi-export)
│   ├── app.module.ts                 # imports ConfigModule + CommonModule + modules; providers APP_GUARD Throttler → Auth → Permission · APP_PIPE · APP_FILTER · APP_INTERCEPTOR
│   ├── openapi-export.ts             # `npm run openapi:export` → openapi/<key>.json mỗi định nghĩa (users, locations, health)
│   ├── config/                       # cấu hình app — không nghiệp vụ, không hạ tầng
│   │   ├── env.ts                    # zod schema → `env` có kiểu, fail-fast lúc boot
│   │   ├── load-env.ts               # nạp .env (import đầu tiên của main.ts / openapi-export.ts)
│   │   ├── logger.ts                 # nestjs-pino: genReqId · redact · bỏ log /health
│   │   ├── i18n.ts                   # nestjs-i18n vi/en, resolver Accept-Language
│   │   └── openapi.ts                # định nghĩa theo module (OPENAPI_DOCS) · tự ghi quyền/public · envelope() · exportOpenApi()
│   ├── common/                       # hạ tầng dùng chung, gom theo mối quan tâm — KHÔNG import modules/
│   │   ├── common.module.ts          # @Global: DRIZZLE · REDIS_CACHE · CacheService · SUPABASE_ADMIN · SupabaseJwtService; imports QueueRoot, Throttler
│   │   ├── auth/
│   │   │   ├── auth.guard.ts         # Bearer → JWKS → ensureProfile → req.user · bỏ qua @Public() · AUTH_USER port
│   │   │   ├── permission.guard.ts   # @RequirePermissions ↔ cache c9:perms:{id}
│   │   │   ├── supabase.ts           # SupabaseJwtService (jose + JWKS, ES256/RS256) · SUPABASE_ADMIN port + adapter
│   │   │   └── decorators.ts         # Public · RequirePermissions · CurrentUser
│   │   ├── database/
│   │   │   ├── drizzle.ts            # postgres.js + drizzle client · DatabaseLifecycle
│   │   │   ├── columns.ts            # cột dùng chung cho *.schema.ts: timestamps · uuidV7Pk · geographyPoint (lat/lng ↔ EWKT/EWKB)
│   │   │   └── schema.ts             # barrel gom *.schema.ts của mọi module
│   │   ├── redis/
│   │   │   ├── redis.provider.ts     # kết nối db0 (REDIS_CACHE) · redisOptions() · đóng khi tắt
│   │   │   ├── cache.ts              # CACHE (key + ttl từng mục) · CacheService (5 thao tác)
│   │   │   ├── queue.ts              # BullModule.forRoot (db1, prefix c9) · QUEUES
│   │   │   └── throttler.guard.ts    # RedisThrottlerStorage (Lua) · AppThrottlerGuard tracker u:/d:/ip:
│   │   └── http/
│   │       ├── exceptions.ts         # ErrorCodes · AppException · AllExceptionsFilter → { error: { code, params, requestId } }
│   │       ├── response.ts           # ResponseInterceptor { data, meta: { requestId } } · withMeta
│   │       ├── pagination.ts         # cursor (created_at, id) · PaginationQuerySchema · pageOf()
│   │       ├── validation.ts         # APP_PIPE StandardSchemaValidationPipe (zod) → 422 · zText · zLatLng
│   │       ├── request-context.middleware.ts  # X-Instance-Id · X-Request-Id
│   │       └── express.d.ts          # req.user
│   └── modules/                      # nghiệp vụ — mỗi module 1 thư mục; file chính ở gốc, chỉ 2 thư mục con dto/ và schema/
│       ├── health/
│       │   ├── health.module.ts · health.controller.ts (GET /health/live · /health/ready) · health.indicators.ts
│       ├── user/
│       │   ├── user.module.ts
│       │   ├── user.controller.ts        # UserController GET/DELETE /me · UserAdminController /admin/roles (@RequirePermissions)
│       │   ├── user.service.ts           # ensureProfile · getMe · deleteMe · touchDevice · getPermissions · setUserRoles
│       │   ├── user.repository.ts        # mọi SQL của user (Drizzle)
│       │   ├── dto/                          # zod request/response — Swagger đọc tự động
│       │   │   ├── me.dto.ts                 # MeResponseSchema
│       │   │   └── role.dto.ts               # ROLE_CODES · RoleSchema · SetUserRolesSchema
│       │   └── schema/
│       │       └── user.schema.ts        # profiles · roles · permissions · role_permissions · user_roles · devices
│       ├── location/                 # MODULE MẪU — copy cấu trúc này cho module mới
│       │   ├── location.module.ts · location.controller.ts · location.service.ts · location.repository.ts · location.constants.ts
│       │   ├── dto/create-location.dto.ts · dto/location.dto.ts     # 1 file / use case, chứa cả request + response
│       │   └── schema/location.schema.ts                          # saved_locations (geography + GIST)
│       └── queue-board/
│           └── queue-board.module.ts # /admin/queues (Bull Board) + middleware JWT + queue:read; tắt khi test
├── drizzle/                          # 0000_extensions · 0001_identity · 0002_seed_rbac · 0003_location (SQL)
├── drizzle.config.ts                 # schema: 'src/**/*.schema.ts'
├── test/
│   ├── unit/*.spec.ts                # logic thuần, không hạ tầng (env · exceptions · columns · permission.guard · pagination · validation · location.service)
│   ├── integration/*.spec.ts         # AppModule thật trên testcontainers (app · cross-cutting · geography · redis-queue · auth-rbac · location · supabase-real)
│   └── setup/{containers,env,jwks}.ts # globalSetup testcontainers + migrate · setupFiles inject URL · Supabase JWKS giả (ES256)
├── scripts/                          # smoke-multi-instance.sh · dev-token.mjs · verify-auth.mjs
├── i18n/{vi,en}/*.json · openapi/{users,locations,health}.json
├── Dockerfile · docker-compose.yml · nginx.conf · vitest.config.ts · .env.example · .github/workflows/ci.yml
└── package.json · tsconfig.json · nest-cli.json
```
Scaffold `nest new` 12: ESM (`type: module`, nodenext), oxlint, Vitest 4, TypeScript 6. Lệnh: `node scripts/dev-token.mjs` (token thật) · `node scripts/verify-auth.mjs` · `npm run openapi:export` · `npm run db:generate` · `npm run db:migrate` · `npm run dev:infra` (postgres+redis) · `npm run dev:infra:full` (+api×2+nginx) · `npm run dev` · `npm run typecheck` · `npm run lint` · `npm test` (unit + integration) · `npm run test:unit` · `npm run test:integration` · `npm run smoke` · `npm run build` → `dist/main.js`.

## 4. Tiếp theo (roadmap bước 7 Pin core)

`modules/pin/` theo mẫu `location/` (schema, repository geo, service, controller, dto/), migration `markers` + `marker_photos`, test geo biên 300 m trên PostGIS thật, presigned upload R2 (decisions-pending).

## 5. Công cụ local đã kiểm tra

Node 24.14 (Docker dùng 22 LTS) · npm 11.9 · Docker 28.2 + Compose 2.37 · Supabase CLI 2.90 · psql · image `postgis/postgis:16-3.4` và `redis:7.4` đã có sẵn.
