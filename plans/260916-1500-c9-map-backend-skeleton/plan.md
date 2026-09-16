# Plan — c9_map backend skeleton (cross-cutting trước business module)

**Ngày:** 2026-09-16 · **Trạng thái:** ◐ Đang làm — phase 01 xong 2026-09-16 · **Chủ sở hữu:** Tech Lead
Mục tiêu: một project NestJS 12 **all-in-one** (HTTP + BullMQ processor trong cùng process) chạy được trên ≥ 2 instance sau nginx, có Postgres 16 + PostGIS riêng, Redis, Supabase Auth (chỉ Auth, Google), Swagger/OpenAPI, i18n, rate limit, test + CI. **Chưa có business module** (pin thật, reputation, alert…).

---

## 1. Phạm vi

| In | Out |
|---|---|
| README §10 bước 1–6 (skeleton → auth) + Swagger + i18n + BullMQ + CI | Module `pin` nghiệp vụ, `engagement`, `reputation`, `alert`, `sos`, `promoted`, `ingest`, `moderation` |
| `src/common/` (hạ tầng phẳng), `src/config/env.ts`, `src/health/`, `src/modules/identity/`, `src/modules/pin/` (chỉ schema rỗng + jobs mẫu) | `libs/`, `packages/`, client SDK (mobile tự sinh từ `openapi/*.json`) |
| Local: docker-compose `postgres` (PostGIS) + `redis` + `api` ×2 + `nginx`; Auth: **Supabase hosted dev project** | Hạ tầng prod (EC2 + RDS + Redis; Supabase prod project) — chỉ ghi `.env.example` |
| Test unit/integration/E2E nền + smoke đa instance | Seed OSM, load test k6 |

## 2. Quyết định đã chốt (không mở lại)

- Tên `c9_map`, prefix `c9:` — [ADR-0001](../../docs/adr/0001-ten-du-an-c9-map.md)
- Supabase Auth phát JWT (Google), NestJS chỉ verify JWKS — [ADR-0002](../../docs/adr/0002-supabase-auth-va-postgres.md)
- Postgres riêng làm DB chính, Supabase chỉ Auth, profile upsert phía app — [ADR-0005](../../docs/adr/0005-postgres-rieng-supabase-chi-auth.md)
- **All-in-one, không `APP_ROLE`; một project `nest new` tiêu chuẩn; cấu trúc phẳng `src/{config,common,health,modules}`** — [ADR-0006](../../docs/adr/0006-all-in-one-cau-truc-don-gian.md) (nguồn sự thật cho cây file)
- Access token 3600 s; thu hồi quyền qua cache perms 5 phút + `DEL` tức thì
- Không Social — [ADR-0003](../../docs/adr/0003-bo-social-module-khoi-mvp.md); polling + push — [ADR-0004](../../docs/adr/0004-polling-thay-realtime.md)
- Validation: `StandardSchemaValidationPipe` built-in + zod 4; Swagger đọc schema zod từ decorator; Express; ESM theo scaffold `nest new` 12
- Quy tắc bất biến: [code-standards.md §2](../../docs/code-standards.md) · cách dùng NestJS: [nestjs-guide.md](../../docs/nestjs-guide.md)
- Nguồn kỹ thuật: [Supabase](../reports/researcher-260916-supabase-auth-nestjs.md), [stack](../reports/researcher-260916-nestjs-multi-instance-stack.md), NestJS docs [01](../reports/nestjs-docs-01-overview-fundamentals.md) [02](../reports/nestjs-docs-02-techniques.md) [03](../reports/nestjs-docs-03-security-openapi.md) [04](../reports/nestjs-docs-04-cli-recipes-faq.md)

## 3. Phase

| # | Phase | Trạng thái | Tiến độ | Link |
|---|---|---|---|---|
| 01 | `nest new` skeleton, `config/env.ts`, `/health/live` | ✅ | 100% | [phase-01](./phase-01-nest-new-skeleton.md) |
| 02 | Docker: `api` ×2 + nginx + Postgres/PostGIS + Redis | ☐ | 0% | [phase-02](./phase-02-docker-multi-instance.md) |
| 03 | Drizzle + PostGIS, `identity.schema.ts` + seed RBAC, `/health/ready` | ☐ | 0% | [phase-03](./phase-03-database-drizzle-postgis.md) |
| 04 | `common/`: exceptions, validation, response, request-context, logger, i18n, openapi ×2 | ☐ | 0% | [phase-04](./phase-04-cross-cutting.md) |
| 05 | Redis, cache, throttler, BullMQ + `pin.jobs.ts` scheduler, Bull Board | ☐ | 0% | [phase-05](./phase-05-redis-cache-throttle-queue.md) |
| 06 | Supabase Auth (Google) + RBAC: JWKS guard, profile upsert, permissions, admin roles API, `/me` | ☐ | 0% | [phase-06](./phase-06-supabase-auth.md) |
| 07 | Vitest + testcontainers + supertest, smoke script, GitHub Actions | ☐ | 0% | [phase-07](./phase-07-testing-ci.md) |

Mỗi phase = 1 checkpoint: làm xong → chạy lệnh "done" → dán kết quả → dừng chờ review. Không sang phase kế.

## 4. Dependency cài theo phase (phiên bản verify `npm view` 2026-09-16)

| Phase | Packages |
|---|---|
| 01 | `nest new` sinh: `@nestjs/core@12.0.3` `@nestjs/common@12.0.3` `@nestjs/platform-express@12.0.3` `reflect-metadata` `rxjs` + dev `@nestjs/cli@12.0.1` (global: `npm i -g @nestjs/cli@12.0.1`) `typescript` `eslint` `prettier`; thêm `@nestjs/config@12.0.0` `zod@4.6.5` |
| 02 | (không npm) Docker 28 + Compose. Không cần Supabase CLI |
| 03 | `drizzle-orm@0.45.2` `postgres@3.4.9` `uuidv7@1.2.1` `@nestjs/terminus@12.0.0` · dev `drizzle-kit@0.31.10` |
| 04 | `@nestjs/swagger@12.0.1` `nestjs-i18n@10.8.5` `nestjs-pino@5.2.0` `pino-http@11.0.0` `helmet` · dev `pino-pretty` (`zod-openapi` chỉ nếu Swagger không render zod — hỏi trước) |
| 05 | `ioredis@6.0.0` `@nestjs/throttler@6.5.0` `@nest-lab/throttler-storage-redis@1.2.0` `@nestjs/bullmq@12.0.0` `bullmq@6.3.6` `@bull-board/nestjs@9.10.1` `@bull-board/api@9.10.1` `@bull-board/express@9.10.1` |
| 06 | `jose@6.2.12` `@supabase/supabase-js@2.116.0` |
| 07 | dev `vitest@5.0.1` `unplugin-swc@1.6.0` `@swc/core` `@testcontainers/postgresql@12.1.0` `@testcontainers/redis@12.1.0` `supertest@7.2.2` `@types/supertest`; **gỡ** `jest` `ts-jest` `@types/jest` |

Quy tắc: **dừng và hỏi** trước khi cài package ngoài bảng này.

## 5. Tiêu chí done tổng

```
nest build && ls dist/main.js                    # tsc build (single project)
npm run dev:infra                                # docker compose up -d postgres redis
psql postgres://c9:c9@127.0.0.1:5432/c9_map -c "select postgis_version()"   # sau db:migrate
nest start --watch                               # dev 1 instance trên host
npm run dev:infra:full                           # + api ×2 + nginx
for i in $(seq 10); do curl -s -D - :3000/health/live -o /dev/null | grep X-Instance-Id; done   # 2 id
curl -s :3000/health/ready | jq .status          # "ok"
open http://localhost:3000/docs/app              # Swagger UI, 2 document
npm run openapi:export && ls openapi/            # app.json admin.json
bash scripts/smoke-multi-instance.sh             # 6/6 PASS
npm test                                         # unit + integration (không cần Supabase)
npm run test:e2e                                 # auth-me pass khi có SUPABASE_* trong .env
```

## 6. Câu hỏi chờ user

1. ~~DB chính~~ — ✅ Postgres riêng; Supabase chỉ Auth (ADR-0005).
2. ~~UI docs~~ — ✅ Swagger UI chính thức. ~~Layout~~ — ✅ **một project `nest new`, không monorepo, không `libs/`** (ADR-0006). ~~Validation~~ — ✅ pipe built-in.
3. ~~`jwt_expiry`~~ — ✅ 3600 s.
4. ~~`APP_ROLE=admin` tách container~~ — ✅ **không có `APP_ROLE`**; all-in-one, scale bằng số instance (ADR-0006).
5. Bull Board `/admin/queues` bảo vệ bằng permission `queue:read` — **giả định có**; nói nếu muốn basic auth.
