# Phase 01 — `nest new` skeleton, `config/env.ts`, `/health/live`

## Context links
- [plan.md](./plan.md) · [ADR-0006 cấu trúc](../../docs/adr/0006-all-in-one-cau-truc-don-gian.md) · [code-standards](../../docs/code-standards.md) · [nestjs-guide](../../docs/nestjs-guide.md)
- NestJS docs: [01 overview/fundamentals](../reports/nestjs-docs-01-overview-fundamentals.md), [04 CLI/FAQ](../reports/nestjs-docs-04-cli-recipes-faq.md)

## Overview
**Ngày:** 2026-09-16 · **Ưu tiên:** P0 · **Trạng thái:** ☐ Chưa bắt đầu
Một project NestJS 12 tiêu chuẩn do `nest new --strict` sinh, không monorepo, không `APP_ROLE`. Env validate bằng zod lúc boot. Endpoint `/health/live` trả instance id.

## Key insights
- **Single project**: `nest-cli.json` giữ mặc định (`sourceRoot: src`, builder `tsc`). `nest build` → `dist/main.js` + cây file. Không Rspack, không `libs/`, không path alias. `--builder swc` là tuỳ chọn sau nếu build chậm.
- **All-in-one**: `main.ts` chỉ có một nhánh: `NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true })`. Processor BullMQ (phase 05) là provider trong module nghiệp vụ, chạy cùng process. Scale = số container.
- CommonJS theo scaffold; Nest 12 là ESM package nhưng app CJS hợp lệ (migration guide). Không `"type": "module"`.
- Node runtime ≥ 22.12 (`node:22-alpine`), CLI cần ≥ 22.22.3 — local 24.14 ✓. `engines.node >= 22.12`.
- Env: `src/config/env.ts` export `envSchema` (zod) + `type Env` + hàm `loadEnv()` parse `process.env` một lần (dùng cho `main.ts` trước khi Nest boot); `ConfigModule.forRoot({ isGlobal: true, cache: true, validationSchema: envSchema })` để Nest cũng validate và cung cấp `ConfigService<Env, true>`. Không `registerAs`.
- Express; `keepAliveTimeout 65000` > nginx 60 s; `forceCloseConnections` chỉ khi `NODE_ENV=development`.

## Requirements
- `nest start --watch` lên < 5 s; `curl :3000/health/live` → `{ "data": { "status": "ok", "instance": "<id>" } }`.
- Thiếu/sai biến bắt buộc → boot fail in tên biến.
- `nest build` → `dist/main.js` chạy bằng `node`.

## Architecture
```
c9_map/
├── package.json · nest-cli.json (mặc định) · tsconfig.json (strict) · tsconfig.build.json
├── eslint.config.mjs · .prettierrc · .editorconfig · .gitignore · .env.example
└── src/
    ├── main.ts               # create(AppModule, {rawBody}) · enableShutdownHooks · listen 3000 · keepAlive
    ├── app.module.ts         # imports: ConfigModule.forRoot(validationSchema), HealthModule (providers APP_* thêm ở phase 04–06)
    ├── config/env.ts         # envSchema, Env, loadEnv()
    └── health/health.controller.ts   # GET /health/live (HealthModule khai báo trong cùng file hoặc health.module.ts nếu > 1 controller)
```
Env tối thiểu: `NODE_ENV` (development|test|production), `PORT` (3000), `INSTANCE_ID` (default `os.hostname()`), `LOG_LEVEL` (info).

## Related code files (CREATE)
- Sinh bởi CLI: `package.json`, `nest-cli.json`, `tsconfig.json`, `tsconfig.build.json`, `eslint.config.mjs`, `.prettierrc`, `.gitignore`
- Viết tay: `.env.example`, `.editorconfig`, `src/main.ts` (sửa), `src/app.module.ts` (sửa), `src/config/env.ts`, `src/health/health.controller.ts`
- **Xoá** scaffold: `src/app.controller.ts`, `src/app.service.ts`, `src/app.controller.spec.ts`; `test/` Jest mẫu giữ tới phase 07 rồi thay

## Implementation steps
1. `nest new c9_map --strict --package-manager npm --skip-git` trong thư mục tạm, copy kết quả vào repo (repo đã có `docs/`, `plans/`, `.claude/`). `nest -v` = 12.0.1.
2. `package.json`: `engines.node >= 22.12`; scripts `dev` = `nest start --watch`, `build` = `nest build`, `start:prod` = `node dist/main.js`, `lint`, `typecheck` = `tsc --noEmit`, `test` (placeholder tới phase 07).
3. Xoá scaffold thừa. `app.module.ts` chỉ import `ConfigModule.forRoot(...)` + `HealthModule`.
4. `config/env.ts`: `envSchema = z.object({ NODE_ENV, PORT: z.coerce.number().default(3000), INSTANCE_ID: z.string().default(hostname()), LOG_LEVEL })`; `loadEnv()` = `envSchema.parse(process.env)` (throw có tên biến).
5. `main.ts`: `const env = loadEnv()` → `create<NestExpressApplication>(AppModule, { rawBody: true, forceCloseConnections: env.NODE_ENV === 'development' })` → `enableShutdownHooks()` → `listen(env.PORT)` → `getHttpServer().keepAliveTimeout = 65000; headersTimeout = 66000` → log `instance=…`.
6. `health.controller.ts`: `@Controller('health')` `@Get('live')` → `{ data: { status: 'ok', instance } }` (đọc `ConfigService`). Nằm ngoài prefix (phase 04 thêm `exclude`).
7. `.env.example` mọi biến + comment; `.env` trong `.gitignore`. `npm run lint && npm run typecheck`.

## Todo
- [ ] `nest new --strict`, copy vào repo, xoá scaffold thừa
- [ ] `config/env.ts` + `ConfigModule.forRoot({ validationSchema })`
- [ ] `main.ts`: rawBody, shutdown hooks, keepAlive
- [ ] `/health/live`
- [ ] scripts, lint, typecheck, `.env.example`, `.editorconfig`

## Success criteria
```
nest -v                                                       # 12.0.1
npm ci && npm run typecheck && npm run lint
npm run dev & sleep 4 && curl -s :3000/health/live | jq -e '.data.status=="ok"'
PORT=abc npm run dev 2>&1 | grep -q PORT                      # boot fail nêu tên biến
npm run build && ls dist/main.js && node dist/main.js &        # chạy từ build
```

## Risk assessment
| Rủi ro | Phòng |
|---|---|
| `nest new` sinh file vào thư mục con thay vì gốc repo | Tạo trong thư mục tạm rồi copy; kiểm `git status` trước commit |
| Node 24 local vs 22 Docker lệch API | CI chạy Node 22; `engines` chặn < 22.12 |
| Đọc `process.env` rải rác | Chỉ `loadEnv()` trong `main.ts` và `ConfigService` ở nơi khác (lint rule sau) |

## Security considerations
- `.env` không commit từ commit đầu; `.env.example` không chứa giá trị thật.

## Next steps
→ [phase-02](./phase-02-docker-multi-instance.md): Docker, 2 instance, Postgres/PostGIS + Redis.
