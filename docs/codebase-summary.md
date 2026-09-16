# Hiện trạng codebase — C9 Map

**Cập nhật:** 2026-09-16 · **Trạng thái:** Active · **Chủ sở hữu:** Tech Lead
Ảnh chụp repo tại thời điểm cập nhật. Cập nhật sau mỗi bước trong [project-roadmap.md](./project-roadmap.md).

---

## 1. Trạng thái

| Mục | Giá trị |
|---|---|
| Bước roadmap | 3 — Drizzle + PostGIS + schema identity/RBAC + `/health/ready`; tiếp theo bước 4 cross-cutting |
| Git | Nhánh `main`; e7f5f1a docs · f1476f4 phase 01 · 55d3858 phase 02 · phase 03 commit kế tiếp |
| Kế hoạch đang chờ duyệt | `plans/260916-1500-c9-map-backend-skeleton/` |

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

## 3. Code hiện có (phase 01–03)

```
src/
├── main.ts                 # loadEnv → NestFactory.create(rawBody) → shutdown hooks → listen → keepAlive 65s
├── app.module.ts           # ConfigModule.forRoot({ validationSchema: envSchema }) + HealthModule
├── config/env.ts           # envSchema (zod) · Env · loadEnv()
├── common/common.module.ts        # @Global: DRIZZLE
├── common/database.ts             # postgres.js + drizzle · geographyPoint customType · uuidv7 · DatabaseLifecycle
├── common/schema.ts               # barrel *.schema.ts
├── common/request-context.middleware.ts   # X-Instance-Id · echo X-Request-Id
├── modules/identity/identity.schema.ts    # profiles · roles · permissions · role_permissions · user_roles · devices
├── health/health.controller.ts    # /health/live · /health/ready (Terminus)
└── health/health.indicators.ts    # DrizzleHealthIndicator
drizzle.config.ts · drizzle/{0000_extensions,0001_identity,0002_seed_rbac}.sql
Dockerfile (targets dev · runtime) · .dockerignore · docker-compose.yml (postgres postgis · redis · api-1 · api-2 · nginx, profile full) · nginx.conf (least_conn)
test/app.e2e-spec.ts        # supertest /health/live
package.json · nest-cli.json · tsconfig*.json · vitest.config*.ts · oxlint.json · .prettierrc · .env.example · .editorconfig
```
Scaffold `nest new` 12: ESM (`type: module`, nodenext), oxlint, Vitest 4, TypeScript 6. Lệnh: `npm run db:generate` · `npm run db:migrate` · `npm run dev:infra` (postgres+redis) · `npm run dev:infra:full` (+api×2+nginx) · `npm run dev` · `npm run typecheck` · `npm run lint` · `npm run test:e2e` · `npm run build` → `dist/main.js`.

## 4. Sẽ có sau bước 2–7 (xem plan)

`src/{main.ts, app.module.ts, config/, common/, health/, modules/}` (một project `nest new`, ADR-0006), `drizzle/`, `test/`, `docker-compose.yml`, `nginx.conf`, `openapi/` (xuất từ CI), `.github/workflows/ci.yml`.

## 5. Công cụ local đã kiểm tra

Node 24.14 (Docker dùng 22 LTS) · npm 11.9 · Docker 28.2 + Compose 2.37 · Supabase CLI 2.90 · psql · image `postgis/postgis:16-3.4` và `redis:7.4` đã có sẵn.
