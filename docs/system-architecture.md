# Kiến trúc hệ thống — C9 Map backend

**Cập nhật:** 2026-09-16 · **Trạng thái:** Active · **Chủ sở hữu:** Tech Lead
Mô tả các quyết định công nghệ đã chốt và **cách cấu hình từng tầng**. Quy tắc code xem [code-standards.md](./code-standards.md); sản phẩm xem [project-overview-pdr.md](./project-overview-pdr.md).

---

## 1. Tổng quan

```
Mobile (Flutter | React Native)  ──HTTPS──▶  nginx (least_conn)  ──▶  api ×N (NestJS, all-in-one)   
        │                                                                 │            │
        └── Supabase Auth (OTP / Google / Apple) ◀── JWT verify (JWKS) ───┘            │
                                                                                         ▼
                                    PostgreSQL 16 + PostGIS (riêng, RDS) ◀── Drizzle ─┐   Redis 7 (cache · rate limit · BullMQ)
                                    Cloudflare R2 (ảnh, presigned)               │   FCM / APNs (push)
```

- **Modular monolith all-in-one**, một image, một process chạy cả HTTP lẫn BullMQ processor; scale bằng số instance stateless sau nginx. Không `APP_ROLE` ([ADR-0006](./adr/0006-all-in-one-cau-truc-don-gian.md)); tách worker khi đo được push fan-out làm chậm API.
- Mobile chỉ cần OpenAPI: backend xuất `openapi/app.json` trong CI, app tự sinh client (Dart hoặc TS).
- Không WebSocket ([ADR-0004](./adr/0004-polling-thay-realtime.md)).

## 2. Quyết định đã chốt — KHÔNG mở lại

| Tầng | Chọn | Lý do một dòng | Không dùng |
|---|---|---|---|
| Backend | **NestJS 12 + TypeScript**, Node 22 LTS | Đội mạnh TS | Java, Go, Django |
| Kiến trúc | **Modular monolith all-in-one**, scale bằng instance | Đội nhỏ; ít file wiring | Microservices, tách worker sớm |
| Auth | **Supabase Auth, chỉ auth** ([ADR-0002](./adr/0002-supabase-auth-va-postgres.md), [ADR-0005](./adr/0005-postgres-rieng-supabase-chi-auth.md)) | Bỏ 1 tuần làm auth; Google/OAuth/refresh sẵn | Tự viết JWT/OTP, Better Auth |
| DB | **PostgreSQL 16 + PostGIS riêng** (local container, prod RDS) — [ADR-0005](./adr/0005-postgres-rieng-supabase-chi-auth.md) | Toàn quyền, không phụ thuộc pooler/backup của Supabase | Supabase Postgres, Mongo |
| ORM | **Drizzle** + `postgres` (postgres.js) | `geometry` chính thức, type từ schema | Prisma, TypeORM |
| Cache / rate limit / queue | **Redis 7** + ioredis | Một hạ tầng, ba việc | Memcached, in-memory |
| Queue + cron | **BullMQ** (`@nestjs/bullmq`) | Trên Redis sẵn có, `upsertJobScheduler` | `@nestjs/schedule`, RabbitMQ |
| Validation | **zod 4** + `StandardSchemaValidationPipe` **có sẵn** trong `@nestjs/common` 12; schema trong `<module>.dto.ts` | Theo docs chính thức, không thêm lib | class-validator, nestjs-zod |
| API docs | **`@nestjs/swagger`** + Swagger UI chính thức (https://docs.nestjs.com/openapi/introduction) | 2 document, xuất JSON cho codegen | Scalar, Postman collection tay |
| i18n | **`nestjs-i18n`**, vi mặc định, en | ICU plural, resolver theo header | Tự viết |
| Log | **`nestjs-pino`** JSON stdout | requestId, redact | winston |
| Ảnh | **Cloudflare R2** + presigned PUT | Không phí egress | Lưu DB, disk |
| Push | **FCM + APNs** | Tiêu chuẩn | OneSignal |
| Realtime | **Không** — polling + push | App đóng thì socket chết | Socket.IO, SSE |
| Tìm kiếm | **PG FTS + `unaccent` + `pg_trgm`** | Đủ tới vài trăm nghìn pin | Elasticsearch |
| Thanh toán | **Cổng VN** (VNPay / MoMo / SePay VietQR) — gđ 3 | Stripe không hỗ trợ merchant VN | Stripe |
| Layout | **Một project `nest new` tiêu chuẩn**, all-in-one, không APP_ROLE — [ADR-0006](./adr/0006-all-in-one-cau-truc-don-gian.md); app giữ CommonJS | Ít file wiring nhất; `nest g library` khi thật sự cần chia sẻ code | Monorepo mode, npm workspaces, Nx |
| HTTP platform | **Express** | Hệ sinh thái; nginx đã nén | Fastify (xem lại > 5k rps) |
| Hạ tầng gđ 1–2 | Supabase (Auth) + RDS Postgres + 1 EC2 docker-compose (api×2 + nginx + redis) | Rẻ nhất mà vẫn có backup/PITR | k8s |
| Test | **Vitest + testcontainers + Supertest + k6** | PostGIS thật, không mock | Jest |

## 3. Ba lớp dữ liệu

| Lớp | Ví dụ | Vòng đời | Cache | Riêng tư |
|---|---|---|---|---|
| **Live** | Kẹt xe, ngập, SOS, deal | Phút–giờ, tự hết hạn | 10–15 s | Ẩn danh tác giả |
| **Landmark / Places** | Danh lam admin tạo, venue promoted | Vĩnh viễn | 15–30 phút | Công khai |
| **Engagement** | Vote, thread, like, check-in, rep | Vĩnh viễn | Đếm trong Redis | Tên hiện trong thread |

## 4. NestJS

| Khía cạnh | Cấu hình |
|---|---|
| Entry | `main.ts` duy nhất, không `APP_ROLE`; mọi instance giống nhau |
| Module gốc | `AppModule` = `CommonModule` (`@Global`: Config, Database, Redis, Cache, Queue, Supabase, Logger, I18n) + feature modules; providers `APP_GUARD/APP_PIPE/APP_FILTER/APP_INTERCEPTOR` khai báo ngay trong `AppModule` |
| Global (token `APP_*` trong module, không `app.useGlobal*`) | `APP_GUARD`: Throttler → Auth → Permission; `APP_PIPE`: `StandardSchemaValidationPipe`; `APP_FILTER`: `AllExceptionsFilter`; `APP_INTERCEPTOR`: envelope `{data, meta}`; `LoggerModule` (pino) |
| Header | Mọi response: `X-Instance-Id`, `X-Request-Id` |
| Shutdown | `enableShutdownHooks()`; worker `worker.close()` đợi job xong |
| Versioning | URI `/api/v1` |
| Port | `3000` trong container; chỉ nginx publish ra host |
| Health | `/health/live` (process), `/health/ready` (DB + Redis, `@nestjs/terminus` custom indicator) |

## 5. Supabase

### 5.1 Auth
| Khía cạnh | Cấu hình |
|---|---|
| Phương thức | **Chỉ Google sign-in** (Supabase provider `google`) ở MVP. Apple thêm khi lên App Store (bắt buộc nếu có social login). Phone OTP **không dùng để đăng nhập**; gđ 2 chỉ dùng để *liên kết* SĐT (`updateUser({phone})` + `verifyOtp`) cho SOS |
| Token | Supabase phát hành JWT **ES256**; access token **3600 s (mặc định, user chốt)**; refresh rotation bật. Thu hồi quyền không phụ thuộc token vì permission đọc từ DB/Redis |
| Xác thực ở NestJS | `jose.createRemoteJWKSet(SUPABASE_URL + '/auth/v1/.well-known/jwks.json')`, kiểm `iss`, `aud = authenticated`, `exp`. NEVER dùng `SUPABASE_JWT_SECRET` HS256 |
| Claims dùng | `sub` (user id), `session_id`, `aal`, `is_anonymous`. NEVER đưa role/permission vào JWT |
| Guard | `AuthGuard` (global, `@Public()` mở) → `PermissionGuard` (`@RequirePermissions`) → `@RequirePhoneVerified()` theo hành động |
| Admin API | `@supabase/supabase-js` với `SUPABASE_SERVICE_ROLE_KEY`, chỉ server: `auth.admin.deleteUser`, `signOut`, `generateLink` |
| Đăng xuất thiết bị | Xoá session qua Admin API; app-side `devices` chỉ giữ push token |
| SMTP / SMS | Không cần ở MVP (không email OTP). SMS provider qua Send SMS hook chỉ khi làm liên kết SĐT gđ 2 |
| Rate limit auth | Supabase tự giới hạn per-IP; NestJS không proxy auth endpoints |

### 5.1b Phân quyền (RBAC) — toàn bộ ở NestJS, không trong JWT

| Khía cạnh | Thiết kế |
|---|---|
| Bảng | `roles(key, name)`, `permissions(key, description)`, `role_permissions(role_id, permission_id)`, `user_roles(user_id, role_id, city_code?)` — schema `public`, seed bằng migration |
| Role seed | `user` (gán khi app upsert profile lần đầu), `moderator`, `venue`, `admin` |
| Permission | Chuỗi `resource:action`, ví dụ `pin:create`, `pin:delete_any`, `report:review`, `user:ban`, `landmark:manage`, `promoted:manage`, `queue:read`, `role:manage` |
| Kiểm tra | `@RequirePermissions('report:review')` → `PermissionGuard` đọc `c9:perms:{userId}` (Set, TTL 300 s), miss → query `user_roles ⋈ role_permissions ⋈ permissions` |
| Quyền sở hữu | Không mã hoá trong permission. Service kiểm `author_id === user.id` hoặc permission `*_any` |
| Thu hồi | Admin đổi role/permission → `DEL c9:perms:{userId}` ngay; JWT không chứa role nên không cần đợi token hết hạn |
| Admin API | `/api/v1/admin/roles`, `/admin/users/:id/roles` — document `/docs/admin`, permission `role:manage` |
| Không dùng | CASL / Supabase Custom Access Token Hook (role trong JWT) — đơn giản hơn và thu hồi tức thì |

### 5.2 Postgres + PostGIS (riêng — ADR-0005)
| Khía cạnh | Cấu hình |
|---|---|
| Extension (migration 0000) | `postgis`, `unaccent`, `pg_trgm`; UUID v7 sinh app-side (`uuidv7` npm) |
| Kết nối | Direct `:5432`, driver `postgres` (postgres.js) `prepare: true`; **không** pooler ở gđ 1; PgBouncer khi tổng kết nối > 50 |
| Pool | `DB_POOL_MAX` 10 mỗi instance (all-in-one); tổng instance × 10 < `max_connections` |
| Role DB | local: `c9` (owner, tạo extension). prod: `c9_migrate` (DDL) và `c9_app` (DML, không DDL) |
| Không có schema `auth` | Mọi dữ liệu user nghiệp vụ nằm ở `public.profiles`; Supabase chỉ được gọi qua Admin API |
| Sync user (app-side) | `AuthGuard` → `IdentityService.ensureProfile(claims)`: flag Redis `c9:v1:profile-exists:{id}` TTL 1h; miss → tx `INSERT profiles … ON CONFLICT DO NOTHING` + `user_roles(user)`. Claims: `sub`, `email`, `user_metadata.full_name`, `user_metadata.avatar_url` |
| `profiles.id` | = `sub` Supabase (uuid v4), **không FK** (khác database) |
| Xoá tài khoản | Tx local (ẩn danh hoá pin/thread, xoá profile/devices) → `auth.admin.deleteUser`; idempotent |
| RLS | Không (NestJS là client duy nhất) |
| Toạ độ | `geography(Point, 4326)` qua `customType` + `USING gist`; `ST_DWithin` trong `*-geo.repository.ts` |
| Pin | Một bảng `markers`: `type`, `status`, `source`, `attrs` JSONB (zod discriminated union), `expires_at`, `confirm_count`, `gone_count`, `report_count`, `author_rep_at_post` |
| Vị trí user | `user_locations(user_id PK, geom, updated_at, sos_alerts_enabled)` UPSERT, partial GIST |
| Cảnh báo | `user_alert_areas(user_id, name, geom, radius_m, schedule, categories[])` + GIST |
| Uy tín | `reputation_events` (nguồn) → `profiles.rep` (cache) |
| Thông báo | `notifications` partition tháng + partial index `read_at IS NULL` |
| Outbox | `outbox_events` — thêm ở gđ 3 |
| Backup | RDS automated backup 7 ngày + PITR; local không backup |

### 5.3 Local dev
- **Auth:** hosted Supabase **dev project** (free tier), bật provider Google, lấy `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` vào `.env`. Không `supabase start` (tuỳ chọn khi offline).
- **DB:** container `postgis/postgis:16-3.4` trong docker-compose, port 5432, volume `pgdata`. Kiểm: `psql $DATABASE_URL -c 'select postgis_version()'`.
- `npm run dev:infra` = `docker compose up -d postgres redis`; thêm `api-1 api-2 nginx` khi test đa instance.

## 6. Drizzle

| Khía cạnh | Cấu hình |
|---|---|
| Schema | `src/modules/<x>/<x>.schema.ts` cạnh module; `drizzle.config.ts` gom bằng glob `src/**/*.schema.ts` |
| Migration | `drizzle-kit generate` → review → commit → `drizzle-kit migrate` là **bước riêng** trước deploy |
| Geo | `customType` cho `geography`; hàm không gian qua `sql` template |
| Điều kiện động | `and(...)` với `undefined` — NEVER `:x IS NULL OR col = :x` |
| Transaction | `db.transaction(async (tx) => …)`; outbox ghi cùng `tx` |
| Type | Suy từ schema; query tổng hợp khai kiểu tay + validate zod |

## 7. Redis

| Việc | Cấu trúc | Key | TTL |
|---|---|---|---|
| Cache viewport | String JSON | `c9:v1:viewport:{zoom}:{tile}:{types}` | 30 s Places, 10 s Live |
| Cache pin | String | `c9:v1:marker:{id}` | 5 phút, `del` khi sửa |
| Đếm like/confirm/unread | `INCR` | `c9:cnt:{kind}:{id}` | Không TTL, dựng lại từ PG |
| Thống kê promoted | Hash `HINCRBY` | `c9:stats:{marker}:{date}` | Gộp PG mỗi giờ |
| Rate limit | Throttler storage | tự quản | theo rule |
| Permission cache | Set | `c9:perms:{userId}` | 5 phút |
| Idempotency | String | `c9:idem:{userId}:{key}` | 24 h |
| SOS live location | String + TTL | `c9:sos:{id}:loc` | 60 s |
| User online | Sorted Set | `c9:online` | dọn theo score |
| BullMQ | tự quản, **DB 1** | `bull:*` | — |

**Cấu hình:** DB 0 `maxmemory-policy allkeys-lru`; DB 1 (BullMQ) không eviction, `maxRetriesPerRequest: null`; `appendonly yes`. Đổi prefix `v1` → `v2` để vô hiệu cache khi đổi shape. NEVER đọc JSON → sửa → ghi lại.

## 8. BullMQ

| Queue | Việc | Concurrency | Limiter |
|---|---|---|---|
| `marker-maintenance` | Hết hạn Live, ẩn pending quá nửa tuổi thọ, trust | 2 | — |
| `reputation` | Áp `reputation_events`, badge, streak | 2 | — |
| `push:critical` | SOS | 20 | 500/s |
| `push:contextual` | Pin mới trong area, reply, like | 10 | 300/s |
| `push:digest` | Promoted, gợi ý | 2 | 100/s, giờ thấp điểm |
| `media` | Resize (sharp), WebP, **strip EXIF** | 4 | — |
| `stats` | Gộp Redis → PG | 1 | — |
| `ingest` | Nguồn tự động (gđ 2) | 1/nguồn | — |
| `outbox` | Drain outbox → queue (gđ 3) | 1 | — |

Processor chạy trên **mọi** instance (all-in-one); một job chỉ được một worker nhận. Repeatable: `upsertJobScheduler(id cố định, { pattern, tz: 'Asia/Ho_Chi_Minh' })` — N instance cùng upsert vẫn chỉ một lịch. Fan-out 2 tầng (planner → sender lô 500). Chống trùng: `jobId` cố định + PK `(notification_id, user_id)`. Bull Board `/admin/queues` sau `AuthGuard` + permission `admin.queues`.

## 9. Rate limit

`@nestjs/throttler` + Redis storage. Tracker: `u:{userId}` → `d:{x-device-id}` → `ip:{ip}`. Mặc định 2 tầng (10/s, 100/phút). Override: tạo pin 1/2 phút + 3 cùng loại/300 m/giờ (kiểm ở service), SOS 1/5 phút, report 10/giờ, GET map 300/phút. Trả `429` + `Retry-After`.

## 10. API docs & codegen

- Hai document: `/docs/app` (Identity, Pin, Engagement, Reputation, Alert) và `/docs/admin` (Moderation, Promoted, Queues) qua `include:`. UI: Swagger UI đi kèm `SwaggerModule.setup()`, theo đúng tài liệu NestJS (https://docs.nestjs.com/openapi/introduction). `jsonDocumentUrl` → `/docs/app-json`, `/docs/admin-json`.
- Schema zod đặt trên decorator (`@Body({ schema })`) → Swagger 12 tự sinh request body/params (zod 4.6 có `~standard.jsonSchema`). Không cần `nestjs-zod`, không bật CLI plugin. Chi tiết: [nestjs-guide.md §6](./nestjs-guide.md).
- CI xuất `openapi/app.json`, `openapi/admin.json` làm artifact. Mobile: Dart `openapi-generator` (dart-dio) hoặc TS `orval` / `@hey-api/openapi-ts`.

## 11. i18n

`nestjs-i18n`; resolver `profiles.locale` → `Accept-Language` → `vi`. Chỉ dịch ở server: push (theo locale **người nhận**), tên category. Không dịch: lỗi API (trả mã), nội dung user. Key `module.action.key`, ICU plural. Ngôn ngữ: vi, en (ko/ja khi có nhu cầu).

## 12. Upload

Presigned PUT R2, 5 phút, ≤ 10 MB, `image/jpeg|png|webp|heic`. Backend xác nhận object → ghi DB → job `media` (thumb 200, medium 800, WebP, strip EXIF). NEVER file đi qua backend.

## 13. Logging & giám sát

`nestjs-pino` JSON, redact `authorization`, `*.token`, `*.phone`, toạ độ user. Mọi dòng có `requestId`, `instance`, `userId?`; `requestId` truyền vào job data. Sentry cho 5xx. Prometheus `/metrics`: p95 viewport, push delivery, SOS latency, queue depth, pool usage.

## 14. Docker & môi trường

| Môi trường | DB + Auth | App |
|---|---|---|
| local | Auth: Supabase dev project (hosted). DB: `postgis/postgis:16-3.4` trong compose | docker-compose: `postgres`, `redis:7-alpine --appendonly yes`, `api-1`, `api-2` (3001/3002 để test thẳng), `nginx` 3000 `least_conn` |
| staging | Auth: Supabase project staging. DB: RDS nhỏ (hoặc Postgres container trên EC2 gđ đầu) | 1 EC2, cùng compose (bỏ `postgres`) |
| prod | Auth: Supabase project prod. DB: RDS Postgres 16 + PostGIS, PITR | EC2 + ElastiCache (hoặc redis trên EC2 gđ 1) |

Health cho compose: `/health/live` + `/health/ready`; không có service worker riêng — mọi `api` chạy cả processor nên `stop_grace_period` 60 s cho `api` để job đang chạy kịp xong. Secrets: `.env.example` commit; prod dùng AWS Secrets Manager / Docker secrets; NEVER trong image.

## 15. Biến môi trường chính

| Tên | Ghi chú |
|---|---|
| `NODE_ENV`, `PORT` (3000), `INSTANCE_ID` (mặc định hostname container) | Chuẩn |
| `DATABASE_URL` | `postgres://c9:…@postgres:5432/c9_map` (container) / `127.0.0.1:5432` (host) |
| `DATABASE_MIGRATE_URL` | Prod: role `c9_migrate`; local = `DATABASE_URL` |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` | JWKS + Admin API; anon key chỉ cho E2E lấy token |
| `SUPABASE_JWT_ISSUER` | `${SUPABASE_URL}/auth/v1` |
| `REDIS_URL` | DB 0 cache; queue dùng `/1` |
| `R2_*`, `FCM_*`, `SENTRY_DSN` | Theo giai đoạn |

Toàn bộ validate bằng zod lúc boot (`config/env.schema.ts`); thiếu → process thoát.
