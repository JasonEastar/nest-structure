# Phase 07 — Vitest + testcontainers + supertest, smoke đa instance, GitHub Actions

## Context links
- [plan.md](./plan.md) · [testing-and-ci.md](../../docs/testing-and-ci.md) · [nestjs-guide §10](../../docs/nestjs-guide.md) · [ADR-0006](../../docs/adr/0006-all-in-one-cau-truc-don-gian.md)
- NestJS docs [01 §Testing](../reports/nestjs-docs-01-overview-fundamentals.md) · stack report §12

## Overview
**Ngày:** 2026-09-16 · **Ưu tiên:** P0 · **Trạng thái:** ☐ Chưa bắt đầu
Thay Jest scaffold bằng Vitest; integration trên PostGIS + Redis thật (testcontainers); E2E supertest; smoke 6 test đa instance; CI xanh trước business module.

## Key insights
- (Đã lỗi thời) `nest new` 12 scaffold **Vitest 4** sẵn (`vitest.config.ts`, `vitest.config.e2e.ts`, `vite-tsconfig-paths`), không Jest → chỉ mở rộng config (projects unit/integration/e2e), không gỡ gì. Ghi chú cũ: `test/jest-e2e.json`, `test/app.e2e-spec.ts`. `vitest.config.ts` gốc: `unplugin-swc` (decorator metadata), `projects` `unit` (`src/**/*.spec.ts`), `integration` (`test/integration/**`), `e2e` (`test/e2e/**`); không cần alias (không có `libs/`).
- Enhancer đăng ký bằng token `APP_*` → `Test.createTestingModule({ imports:[AppModule] }).overrideProvider(...)` hoạt động; E2E `app.e2e` override `AuthGuard` bằng guard giả gắn `req.user` — không cần Supabase.
- Integration: `@testcontainers/postgresql` image `postgis/postgis:16-3.4` + `@testcontainers/redis`; chạy `drizzle-orm/postgres-js/migrator` (không fixture `auth`). Bật `logger: true` cho Drizzle để soi N+1.
- E2E `auth-me` cần hosted dev project → `describe.skipIf(!process.env.SUPABASE_URL)`; CI job riêng chỉ khi có secrets. Không `supabase/setup-cli`.
- Contract test `test/contracts/supabase-admin.contract.ts` chạy cùng bộ assertion trên adapter thật (job e2e) và `InMemorySupabaseAdmin` (unit) — mock ném lỗi cùng shape (LSP).
- Scheduler test: 2 `NestApplication` (all-in-one) cùng Redis → `queue.getJobSchedulers()` length 1.
- Smoke 6 test: LB (2 instance id), cache chung, rate limit chung, cron 1 dòng/phút, JWT verify 2 instance, `X-Request-Id` echo.

## Requirements
- `npm test` = unit + integration xanh trên máy có Docker, không cần Supabase.
- `npm run test:e2e` xanh khi có `SUPABASE_*`; tự skip suite auth khi thiếu.
- `bash scripts/smoke-multi-instance.sh` → `6/6 PASS` (JWT `SKIP` nếu không `TOKEN`).
- CI xanh Node 22; artifact `openapi/*.json`.

## Architecture
```
vitest.config.ts                  # gốc; projects unit / integration / e2e; unplugin-swc; testTimeout 60s integration; globalSetup containers
src/**/*.spec.ts                  # unit: config/env.spec.ts, common/exceptions.spec.ts, common/permission.guard.spec.ts
test/
├── setup/{containers.ts, migrate.ts}          # start PostGIS + Redis, export env, chạy migrate 0000→0002
├── contracts/supabase-admin.contract.ts       # runSupabaseAdminContract(factory)
├── mocks/in-memory-supabase-admin.ts
├── integration/
│   ├── database.int.spec.ts      # extensions, geography insert, ST_DWithin biên 200 m (200 m true, 200.5 m false), seed RBAC
│   ├── identity.int.spec.ts      # ensureProfile 2 lần song song → 1 profile, roles ['user']; deleteMe với mock SUPABASE_ADMIN
│   ├── cache.int.spec.ts         # CacheService incr/sadd
│   ├── throttle.int.spec.ts      # 2 app cùng Redis → 429 chung
│   └── scheduler.int.spec.ts     # 2 app → 1 scheduler
└── e2e/
    ├── app.e2e.spec.ts           # health, error shape, validation, request-id (AuthGuard override)
    └── auth-me.e2e.spec.ts       # phase 06, skipIf thiếu SUPABASE_*
scripts/smoke-multi-instance.sh
.github/workflows/ci.yml
```

## Related code files (CREATE)
- `vitest.config.ts`; **xoá** Jest scaffold + deps
- `test/setup/{containers.ts, migrate.ts}`, `test/contracts/supabase-admin.contract.ts`, `test/mocks/in-memory-supabase-admin.ts`
- `test/integration/{database,identity,cache,throttle,scheduler}.int.spec.ts`, `test/e2e/app.e2e.spec.ts`
- `src/config/env.spec.ts`, `src/common/exceptions.spec.ts`, `src/common/permission.guard.spec.ts`
- `scripts/smoke-multi-instance.sh`, `.github/workflows/ci.yml`
- `package.json` scripts `test`, `test:unit`, `test:integration`, `test:e2e`, `smoke`

## Implementation steps
1. Gỡ Jest; `vitest.config.ts` (swc `decoratorMetadata`, `legacyDecorator`), scripts.
2. `containers.ts`/`migrate.ts`; env test ghi vào `process.env` trước khi import `AppModule`.
3. Unit specs mẫu (env, exceptions filter, permission guard với `Reflector` spy).
4. Integration specs theo Architecture (2 app trong `throttle`/`scheduler` = 2 `Test.createTestingModule` với `INSTANCE_ID` khác).
5. `app.e2e.spec.ts` supertest, `overrideProvider(AuthGuard)`.
6. Contract test + mock; chạy với mock trong unit, với adapter thật trong job e2e-auth.
7. `smoke-multi-instance.sh`: curl 3000/3001/3002, in PASS/FAIL, exit ≠ 0 nếu FAIL; JWT dùng `TOKEN` env.
8. `ci.yml`: job `check` (Node 22, `npm ci`, lint, typecheck, test:unit, test:integration (Docker sẵn), `nest build`, `openapi:export` → `upload-artifact`); job `e2e-auth` (`needs: check`, `if` có secrets, `services:` postgis + redis, `test:e2e`); placeholder `migrate`/`deploy` `if: false`.
9. Cập nhật `docs/codebase-summary.md`, `docs/project-roadmap.md` (bước 1–6 ✅) sau khi xong.

## Todo
- [ ] Mở rộng vitest.config.ts (integration project + testcontainers globalSetup), scripts
- [ ] testcontainers setup + migrate + Drizzle query log
- [ ] unit specs mẫu
- [ ] 5 integration specs
- [ ] app e2e (AuthGuard override)
- [ ] contract test + mock SUPABASE_ADMIN
- [ ] smoke script 6 test
- [ ] ci.yml (e2e-auth gated secrets)

## Success criteria
```
npm run test:unit
npm run test:integration          # Docker, không Supabase
npm run test:e2e                  # auth skip nếu thiếu SUPABASE_*; pass khi có
npm run dev:infra:full && bash scripts/smoke-multi-instance.sh   # "6/6 PASS"
gh run list --limit 1            # success
ls openapi/app.json openapi/admin.json
```

## Risk assessment
| Rủi ro | Phòng |
|---|---|
| testcontainers chậm trên CI | Cache image; `reuse` local; timeout 120 s |
| E2E auth flaky (mạng tới Supabase) | Job riêng, retry 1; sleep giữa test tránh rate limit admin API |
| PR từ fork không secrets → e2e-auth skip | Chấp nhận; bắt buộc trên nhánh chính |
| Smoke cron phụ thuộc timing | Chờ tối đa 70 s, đếm qua `docker compose logs` |
| Mock `SUPABASE_ADMIN` lệch thật | Contract test chạy cả hai |

## Security considerations
- CI chỉ có secret dev project (GitHub environment `dev`), không prod.
- User E2E tạo trên dev project có prefix email rõ, dọn trong `afterAll`.
- Testcontainers không expose port ngoài runner; `openapi/*.json` không chứa dữ liệu thật.

## Next steps
Sau phase 07: cập nhật `docs/codebase-summary.md`, `docs/project-roadmap.md`, mở plan mới cho module `pin` core (README §10 bước 7).
