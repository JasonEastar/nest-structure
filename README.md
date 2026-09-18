# C9 Map — Backend API

Bản đồ đời sống thời gian thực cho TP.HCM: kẹt xe, ngập, chợ đêm, sự kiện, danh lam… hiện thành **pin** có tuổi thọ, do người xung quanh xác nhận, tự hết hạn. Repo này là API backend (NestJS). App mobile là repo riêng, gọi API qua OpenAPI.

## Tech stack

| Thành phần | Công nghệ | Dùng để |
|---|---|---|
| Framework | NestJS 12 (TypeScript, ESM) | HTTP API, modular monolith, chạy nhiều instance sau nginx |
| Database | PostgreSQL 16 + PostGIS | Dữ liệu chính, truy vấn toạ độ (bán kính, viewport) |
| ORM | Drizzle | Schema bằng TypeScript, migration SQL, query có kiểu |
| Auth | Supabase Auth (Google) | Đăng nhập, phát JWT. Backend chỉ xác minh, role/permission lưu ở Postgres |
| Cache & queue | Redis 7 + BullMQ | Cache, rate limit đếm chung mọi instance, job nền |
| Validation & docs | zod 4 + Swagger (`@nestjs/swagger`) | Một schema cho validate, kiểu TS và tài liệu API |
| i18n | nestjs-i18n | Thông báo lỗi vi/en theo header `Accept-Language` |
| Test | Vitest + testcontainers + supertest | Unit và integration trên Postgres/Redis thật |
| Vận hành | Docker Compose, nginx, GitHub Actions | Dev đa instance, CI lint/test/build |

## Chạy local

Yêu cầu: Node 22+, Docker, một Supabase project đã bật Google provider và JWT Signing Keys (ES256).

```bash
cp .env.example .env     # điền SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY
npm install
npm run dev:infra        # Postgres + PostGIS, Redis (Docker)
npm run db:migrate       # tạo bảng + seed role/permission
npm run dev              # http://localhost:3000, sửa file tự reload
```

- Swagger: http://localhost:3000/docs (dropdown chọn User & Auth, Locations, Health)
- Lấy token thật để gọi API: `TOKEN=$(node scripts/dev-token.mjs)` rồi `curl -H "authorization: Bearer $TOKEN" localhost:3000/api/v1/me`
- Xem Redis: `npm run dev:tools` → http://localhost:5540 · Xem Postgres: `npm run db:studio`

## Cấu trúc

```
src/
├── main.ts · app.ts · app.module.ts   # khởi động, cấu hình app, nối module
├── config/        env · logger · i18n · openapi
├── common/        auth/ (guard, Supabase JWT) · database/ (Drizzle, cột dùng chung) · redis/ (cache, queue, rate limit) · http/ (lỗi, response, validate)
└── modules/
    ├── health/    /health/live · /health/ready
    ├── user/      /me · /admin/roles (profile, role, permission)
    ├── location/  /locations · /public/locations/nearby — module mẫu, copy để tạo module mới
    └── queue-board/  /admin/queues (Bull Board)
test/  unit/ · integration/ · setup/        drizzle/  migration SQL        i18n/  vi, en        openapi/  JSON xuất cho mobile
```

Mỗi module: `x.module.ts`, `x.controller.ts`, `x.service.ts`, `x.repository.ts`, `x.constants.ts`, `dto/`, `schema/`.

## Lệnh

| Việc | Lệnh |
|---|---|
| Chạy | `npm run dev` · `npm run build` · `npm run start:prod` |
| Kiểm tra | `npm run lint` · `npm run typecheck` · `npm test` (unit + integration, tự dựng PostGIS + Redis, ~15 s) |
| Hạ tầng | `npm run dev:infra` · `npm run dev:infra:full` (2 instance + nginx) · `npm run dev:tools` · `npm run dev:infra:down` |
| Database | `npm run db:generate` (schema → SQL) · `npm run db:migrate` · `npm run db:studio` |
| API docs | `npm run openapi:export` → `openapi/<module>.json` |
| Đa instance | `TOKEN=$(node scripts/dev-token.mjs) npm run smoke` |

## Quy ước API

- Đường dẫn `/api/v1/<resource>` danh từ số nhiều. Route công khai: `/api/v1/public/...`. Route quản trị: `/api/v1/admin/...`, cần permission.
- Mọi response cùng 5 field: `success`, `code`, `msg`, `data`, `meta`. Thành công `code="OK"`, `msg=""`. Lỗi `success=false`, `data=null`, `code` là mã lỗi, `msg` đã dịch theo `Accept-Language`, chi tiết lỗi trong `meta`.
- Token: `Authorization: Bearer <access_token của Supabase>`.

## Tài liệu

Bắt đầu với [docs/code-walkthrough.md](./docs/code-walkthrough.md) (đọc code từ đâu, request đi qua đâu) và [docs/api-cookbook.md](./docs/api-cookbook.md) (cách viết một API). Toàn bộ tài liệu khác nằm trong [docs/](./docs/): kiến trúc, quy chuẩn code, roadmap, test, quyết định.
