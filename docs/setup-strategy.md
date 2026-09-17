# Chiến lược cấu hình & thứ tự dựng — C9 Map backend

**Cập nhật:** 2026-09-16 · **Trạng thái:** Active · **Chủ sở hữu:** Tech Lead
Trả lời "cấu hình dự án thế nào, vì sao, config gì, cấu trúc ra sao, làm gì trước". Chi tiết từng tầng ở [system-architecture.md](./system-architecture.md); từng bước có lệnh "done" ở `plans/260916-1500-c9-map-backend-skeleton/`.

---

## 1. Ba ràng buộc quyết định mọi thứ

| Ràng buộc | Hệ quả cấu hình |
|---|---|
| **Đa instance từ ngày 1** | Không state trong RAM; mọi thứ chia sẻ nằm ở Postgres (bền) hoặc Redis (tạm); không `@Cron`; dev luôn chạy 2 replica sau nginx để lỗi lộ sớm |
| **Đội 1–2 người** | Một repo, một image, một process **all-in-one** (HTTP + processor) — không `APP_ROLE`, không tách service; dùng thứ có sẵn trong Nest 12 (pipe zod, Swagger đọc zod, Config zod) thay vì thêm lib |
| **Dữ liệu vị trí** | Postgres **phải** có PostGIS: `geography(Point,4326)` + GIST, `ST_DWithin`. Đây là lý do DB riêng dùng image `postgis/postgis:16-3.4` và prod RDS bật extension `postgis` |

## 2. Cấu trúc repo — vì sao chọn vậy

```
c9_map/
├── src/
│   ├── main.ts               # bootstrap duy nhất, không APP_ROLE
│   ├── app.module.ts         # CommonModule + feature modules; APP_GUARD/PIPE/FILTER/INTERCEPTOR khai báo ở đây
│   ├── config/env.ts         # zod schema + typed env (1 file)
│   ├── common/               # hạ tầng phẳng, 1 file/1 việc: database, redis, queue, supabase, guards, exceptions, validation, response, logger, i18n, openapi
│   ├── health/               # health.controller + health.indicators
│   └── modules/              # user/ pin/ … mỗi module: module · controller · service · repository · schema · dto · constants · jobs
├── drizzle/ · drizzle.config.ts   # migration SQL; schema glob src/**/*.schema.ts
├── test/                     # integration (testcontainers) + e2e
├── docker-compose.yml        # postgres(postgis) · redis · api-1 · api-2 · nginx
├── nginx.conf · Dockerfile · vitest.config.ts · .env.example
└── package.json · tsconfig.json · nest-cli.json (mặc định nest new)
```
Cây đầy đủ: [ADR-0006](./adr/0006-all-in-one-cau-truc-don-gian.md).

| Lựa chọn | Vì sao |
|---|---|
| Một project `nest new`, **không APP_ROLE**, không monorepo, không `libs/` | Ít file wiring nhất (bỏ `api/worker/core.module`); scale bằng instance; mobile chỉ cần OpenAPI; tách worker khi đo được |
| `modules/<nghiệp vụ>` thay `controllers/ services/` | Skill rule #1 (arch-feature-modules); mở file là thấy cả module; xoá tính năng = xoá thư mục |
| DTO (`*.dto.ts`) và bảng Drizzle (`*.schema.ts`) **cạnh module** | Mở thư mục module thấy đủ contract + bảng + logic; `drizzle-kit` gom bằng glob |
| `common/` phẳng, một file một việc | Ít thư mục hơn để tìm; tách thành thư mục con chỉ khi file > 200 dòng |
| `common/` không import `modules/` | Một chiều; `common` là hạ tầng, `modules` là nghiệp vụ |
| `APP_*` providers trong `app.module.ts` | Thứ tự guard (Throttler → Auth → Permission) nhìn thấy một chỗ; test override được qua token |

## 3. Cấu hình từng tầng — config gì, vì sao

| Tầng | Config chốt | Vì sao |
|---|---|---|
| **Env** | `config/env.ts`: zod schema → `ConfigModule.forRoot({ isGlobal, cache, validationSchema })`; thiếu biến → thoát ngay | Fail-fast lúc boot, không lỗi ngầm lúc chạy; Nest 12 nhận zod trực tiếp |
| **DB** | `postgres` driver, `prepare: true`, `DB_POOL_MAX` 10 mỗi instance; migration = bước riêng (`drizzle-kit migrate`) bằng role `c9_migrate`; app chạy role `c9_app` (không DDL) | Không pooler nên prepared statement dùng được; migration tự chạy lúc boot × 2 replica = race |
| **Auth** | Supabase chỉ Auth: JWKS `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`, `aud=authenticated`, token 3600 s; `SUPABASE_SERVICE_ROLE_KEY` chỉ server | Không tự làm auth; token 1 giờ chấp nhận được vì quyền không nằm trong token |
| **Profile** | Upsert phía app ở request đầu tiên (`ON CONFLICT DO NOTHING` + role `user`), flag Redis 1 giờ | DB riêng nên không có trigger `auth.users`; upsert idempotent, an toàn đa instance |
| **RBAC** | Bảng `roles/permissions/role_permissions/user_roles`, cache `c9:perms:{id}` 300 s, `DEL` khi admin đổi | Thu hồi tức thì, không đợi token hết hạn |
| **Validation** | `StandardSchemaValidationPipe` (`APP_PIPE`), `@Body({ schema })` | Có sẵn Nest 12, zod làm luôn coerce/default/strip HTML |
| **Swagger** | Một định nghĩa mỗi module nghiệp vụ (`/docs`, dropdown) qua `include:`; quyền/public tự ghi từ metadata guard; export `openapi/<key>.json` trong CI | Mobile codegen; admin API không lộ cho app |
| **Redis** | DB 0 cache (`allkeys-lru`), DB 1 BullMQ (không eviction, `maxRetriesPerRequest: null`), `appendonly yes` | Eviction làm mất job; tách DB tránh nhầm |
| **Rate limit** | Throttler Redis, tracker `u:` → `d:` → `ip:`, `trust proxy` 1 | Đếm chung qua 2 instance; user có token bị giới hạn theo user, không theo IP của nginx |
| **Queue/cron** | BullMQ `upsertJobScheduler(id cố định, tz Asia/Ho_Chi_Minh)` | Chạy đúng 1 lần dù N replica |
| **Log** | pino JSON, redact token/phone/toạ độ, `requestId` + `instance` mọi dòng | Gộp log 2 instance vẫn truy được request |
| **Health** | `/health/live` (process) · `/health/ready` (DB + Redis, 503 khi shutdown) ngoài `/api` prefix | nginx/compose ngừng route trước khi container tắt |
| **HTTP** | Express, `rawBody: true`, `keepAliveTimeout 65 s` > nginx 60 s, `enableShutdownHooks` | Webhook thanh toán ký HMAC; tránh `ECONNRESET` ngẫu nhiên |
| **Docker** | Multi-stage `node:22-alpine`, `nest build`; `stop_grace_period` 60 s (api chạy cả processor) | Image nhỏ; job đang chạy kịp xong |

## 4. Làm gì trước — và vì sao thứ tự đó

| Thứ tự | Việc | Vì sao đứng ở đây | Done khi |
|---|---|---|---|
| 1 | `nest new` + `config/env.ts` (zod) + `/health/live` | Mọi thứ sau cần chỗ đặt; env fail-fast phải có trước khi thêm dịch vụ nào | `nest start --watch` lên |
| 2 | Docker 2 replica + nginx + postgres(postgis) + redis | Bắt lỗi "state trong RAM" **trước** khi có business code; `select postgis_version()` chứng minh geo sẵn sàng | 10 curl thấy 2 `X-Instance-Id` |
| 3 | Drizzle + migration 0000 (postgis, unaccent, pg_trgm) + schema user/RBAC + `/health/ready` | Bảng `profiles`/roles là nền cho auth; extension phải có trước schema geo | `drizzle-kit migrate` ok, ready 200 |
| 4 | `common/`: exceptions + validation + response + pino + versioning + Swagger + i18n | Shape lỗi/response phải chốt trước khi viết endpoint đầu tiên, nếu không mobile phải sửa lại | `/docs/app` mở, lỗi đúng shape |
| 5 | Redis + throttler + BullMQ scheduler + Bull Board | Guard chain cần throttler; auth cần cache permission | rate limit đếm chung 2 instance; job 1 dòng/phút |
| 6 | Supabase JWKS guard + profile upsert + RBAC guard + admin roles API | Tới đây mới có "user" thật để gắn vào pin | E2E `/me`, 403 đúng, gán role tức thì |
| 7 | Vitest + testcontainers + smoke đa instance + CI | Có auth và DB thật rồi mới test được luồng đầy đủ; CI trước business module để mọi PR sau đều xanh | `npm test` xanh, CI xanh |
| 8 | Pin core (schema markers, geo repository, viewport cache, upload R2) | Business module đầu tiên, dựa trên tất cả ở trên | Integration geo với 10k seed |

Nguyên tắc: **hạ tầng → cross-cutting → auth → test → nghiệp vụ**. Đảo thứ tự (viết pin trước) thì mỗi bước sau phải quay lại sửa pin.

## 5. Môi trường

| | local | staging | prod |
|---|---|---|---|
| Auth | Supabase dev project (free) | Supabase project staging | Supabase project prod |
| DB | container `postgis/postgis:16-3.4` | cùng container trên EC2 (volume EBS, pg_dump → S3) | cùng container, tự host (WAL archiving cho PITR) |
| Redis | container | container trên EC2 | container trên EC2 (ElastiCache tuỳ chọn sau) |
| App | compose api×2 + nginx | compose 2 replica | compose 2 replica, scale bằng `--scale api=N` |
| Secrets | `.env` (không commit) | Docker secrets / SSM | AWS Secrets Manager |

Vì sao Supabase dev project thay `supabase start`: Google OAuth cần project thật; CLI local kéo ~12 container chỉ để có GoTrue; token E2E lấy qua Admin API (`generateLink` → `verifyOtp`) hoạt động như nhau ở cả hai.

## 6. Việc cần bạn làm tay trước phase 1

1. Tạo Supabase project `c9-map-dev`, bật provider **Google** (Client ID/Secret từ Google Cloud Console, redirect `https://<ref>.supabase.co/auth/v1/callback`). Lấy `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
2. Cài `@nestjs/cli@12` global: `npm i -g @nestjs/cli@12.0.1` (Node 24 local đủ).
3. Câu còn lại trong `plans/.../plan.md` §6: Bull Board bảo vệ bằng permission `queue:read` (khuyến nghị: có). `APP_ROLE` đã bỏ (ADR-0006).

## 7. Những gì cố tình KHÔNG cấu hình bây giờ

| Thứ | Khi nào |
|---|---|
| PgBouncer | Tổng kết nối > 50 |
| Tách worker / thêm `APP_ROLE` | Push fan-out làm chậm API (đo p95) — lúc đó thêm 1 biến env, không đổi cấu trúc |
| `nestjs-cls` | Cần truyền context sang job ngoài `requestId` |
| Outbox | Bước 9 (Live + reputation) |
| Đổi ESM ↔ CJS | Giữ ESM như `nest new` 12 sinh ra; không chuyển đổi |
| Fastify | > 5k rps đo được |
| k8s | Một EC2 không đủ |
