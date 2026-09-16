# Phase 03 — Drizzle + PostGIS, `identity.schema.ts` + seed RBAC, `/health/ready`

## Context links
- [plan.md](./plan.md) · [code-standards §2.3 dữ liệu](../../docs/code-standards.md) · [system-architecture §5.2, §6](../../docs/system-architecture.md) · [ADR-0005](../../docs/adr/0005-postgres-rieng-supabase-chi-auth.md) · [ADR-0006](../../docs/adr/0006-all-in-one-cau-truc-don-gian.md)
- Stack report §7 (Drizzle/PostGIS), NestJS docs [04 §Terminus](../reports/nestjs-docs-04-cli-recipes-faq.md)

## Overview
**Ngày:** 2026-09-16 · **Ưu tiên:** P0 · **Trạng thái:** ☐ Chưa bắt đầu
`common/database.ts` cung cấp Drizzle client; migration đầu bật extensions; schema identity nằm trong `modules/identity/identity.schema.ts`; seed RBAC; `/health/ready` kiểm DB.

## Key insights
- Schema Drizzle nằm **cạnh module** (`src/modules/<x>/<x>.schema.ts`); `drizzle.config.ts` gom bằng glob `schema: './src/**/*.schema.ts'`. `common/database.ts` `import * as schema` từ một barrel `src/common/schema.ts` (re-export các `*.schema.ts`) để `drizzle(client, { schema })` có type đầy đủ.
- Pool đơn: `DB_POOL_MAX` (default 10). Direct → `prepare: true`.
- Drizzle 0.45 có `geometry` built-in, không có `geography` → `customType` trong `common/database.ts`; index GIST viết SQL trong migration.
- Migration là bước riêng `npm run db:migrate` (`drizzle-kit migrate`), **NEVER** lúc boot.
- `profiles.id` = `sub` Supabase (uuid v4), **không FK**; bảng khác uuid v7 app-side (`uuidv7`).
- Sync profile app-side ở phase 06; phase này chỉ tạo schema + seed.
- Terminus 12: inject `HealthIndicatorService`; `const ind = his.check('db'); try { await db.execute(sql\`select 1\`); return ind.up(); } catch (e) { return ind.down({ message }); }`.

## Requirements
- `npm run db:generate` / `db:migrate` / `db:studio` chạy với Postgres trong compose.
- Sau migrate: 3 extension, 6 bảng identity, seed roles/permissions.
- `/health/ready` 200 khi DB ok, 503 khi DB tắt.

## Architecture
```
drizzle.config.ts                 # schema './src/**/*.schema.ts' · out './drizzle' · dialect postgresql · dbCredentials.url = DATABASE_URL
drizzle/
├── 0000_extensions.sql           # CREATE EXTENSION IF NOT EXISTS postgis, unaccent, pg_trgm
├── 0001_identity.sql             # drizzle-kit generate
└── 0002_seed_rbac.sql            # roles user/moderator/venue/admin + permissions + role_permissions (idempotent ON CONFLICT DO NOTHING)
src/common/
├── database.ts                   # DRIZZLE token · provider drizzle(postgres(url,{max,prepare:true}),{schema}) · type Db · geography customType · uuidv7()
└── schema.ts                     # export * from '../modules/identity/identity.schema'  (barrel cho drizzle(schema))
src/common/common.module.ts       # @Global · providers/exports DRIZZLE (mở rộng ở phase 04–06)
src/modules/identity/identity.schema.ts   # profiles, roles, permissions, role_permissions, user_roles, devices
src/health/
├── health.controller.ts          # thêm GET /health/ready (@HealthCheck)
└── health.indicators.ts          # DrizzleHealthIndicator (Redis thêm phase 05)
```
Bảng (snake_case, `created_at/updated_at timestamptz`):
| Bảng | Cột chính |
|---|---|
| `profiles` | `id uuid PK` (= `sub`, không FK), `email`, `display_name`, `username UNIQUE`, `avatar_url`, `locale` (default `vi`), `home_city_code`, `phone_verified_at`, `deleted_at` |
| `roles` | `id uuid v7`, `code UNIQUE` (`user`, `moderator`, `venue`, `admin`) |
| `permissions` | `id`, `code UNIQUE` (`pin:create`, `pin:delete_any`, `report:review`, `user:ban`, `landmark:manage`, `promoted:manage`, `queue:read`, `role:manage`) |
| `role_permissions` | PK `(role_id, permission_id)` |
| `user_roles` | PK `(user_id, role_id)`, `city_code?`; `user_id FK profiles CASCADE` |
| `devices` | `id`, `user_id FK profiles CASCADE`, `device_id`, `platform`, `push_token`, `last_seen_at`; UNIQUE `(user_id, device_id)` |

## Related code files (CREATE)
- `drizzle.config.ts`, `drizzle/0000_extensions.sql`, `drizzle/0002_seed_rbac.sql` (0001 sinh)
- `src/common/database.ts`, `src/common/schema.ts`, `src/common/common.module.ts`
- `src/modules/identity/identity.schema.ts`
- `src/health/health.indicators.ts` (+ sửa `health.controller.ts`)
- sửa `src/config/env.ts` (`DATABASE_URL`, `DB_POOL_MAX`), `src/app.module.ts` (import `CommonModule`, `TerminusModule`)
- `package.json` scripts `db:generate`, `db:migrate`, `db:studio`

## Implementation steps
1. Cài deps phase 03. `drizzle.config.ts` với glob schema.
2. `identity.schema.ts` 6 bảng (uuid v7 default app-side qua `$defaultFn(() => uuidv7())`).
3. `common/database.ts`: `geography` customType (`toDriver` → `ST_SetSRID(ST_MakePoint(lng,lat),4326)::geography`, `fromDriver` parse), provider `DRIZZLE` với `postgres(url, { max: env.DB_POOL_MAX, prepare: true })`, `onModuleDestroy` → `client.end()`.
4. `common.module.ts` `@Global()` export `DRIZZLE`; import vào `AppModule`.
5. `db:generate` → `0001_identity.sql`; viết tay `0000_extensions.sql` (đặt trước trong journal) và `0002_seed_rbac.sql`.
6. `db:migrate` trên compose; kiểm `\dx`, `\dt`.
7. `health.indicators.ts` + `/health/ready`; `TerminusModule` trong `AppModule`.

## Todo
- [ ] drizzle.config.ts + scripts
- [ ] identity.schema.ts (6 bảng) + barrel `common/schema.ts`
- [ ] common/database.ts (client, geography, uuid) + CommonModule
- [ ] 0000 extensions, 0001 generate, 0002 seed
- [ ] /health/ready + DrizzleHealthIndicator

## Success criteria
```
npm run db:migrate
psql $DATABASE_URL -c "\dx" | grep -E "postgis|unaccent|pg_trgm"
psql $DATABASE_URL -c "select count(*) from roles"                  # 4
psql $DATABASE_URL -c "select code from permissions" | grep queue:read
curl -s :3000/health/ready | jq -e '.status=="ok"'
docker compose stop postgres && curl -s -o /dev/null -w "%{http_code}" :3000/health/ready   # 503
```

## Risk assessment
| Rủi ro | Phòng |
|---|---|
| Glob schema bỏ sót file | Barrel `common/schema.ts` là nguồn cho runtime; CI so số bảng generate vs migrate |
| Migration 0000 sai thứ tự journal | Đặt `0000_extensions` trước khi `generate` lần đầu; kiểm `drizzle/meta/_journal.json` |
| `geography` customType parse sai | Integration test phase 07 insert + `ST_DWithin` biên 200 m |
| Migrate chạy lúc boot bởi nhầm | Không có code migrate trong `main.ts`; chỉ script |

## Security considerations
- Local `c9` là owner; prod tạo `c9_migrate` (DDL) và `c9_app` (DML) — ghi `.env.example`.
- Không log `DATABASE_URL`.

## Next steps
→ [phase-04](./phase-04-cross-cutting.md): exceptions, validation, response, logger, i18n, Swagger.
