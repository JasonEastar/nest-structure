# C9 Maps — Project Brief cho Claude Code

> **Cách dùng:** đặt file này ở gốc repo với tên `CLAUDE.md` (hoặc `docs/PROJECT_BRIEF.md` và trỏ tới từ `CLAUDE.md`). Claude Code đọc nó trước mọi tác vụ. Tài liệu này mô tả **cái gì, vì sao, và quy tắc** — không mô tả endpoint hay code cụ thể. Bước đầu tiên của Claude Code là **phân tích và lập kế hoạch**, không phải viết code (xem mục 12).

---

## 1. Dự án là gì

C9 Maps là ứng dụng bản đồ cộng đồng cho thị trường Việt Nam. Người dùng xem và tạo marker theo chủ đề (địa điểm nổi tiếng, camping, câu cá, chợ đêm), báo tình trạng thời gian thực (kẹt xe, ngập, chỗ nguy hiểm), gửi SOS, checkin, đăng bài, bình luận, follow nhau. Chủ shop claim địa điểm, phát deal tạm thời, mua gói promoted. Kiểm duyệt viên và admin vận hành qua web dashboard riêng.

**Đội:** 1–2 người, mạnh TypeScript, đã có frontend React. **Giai đoạn:** chưa có người dùng. **Ưu tiên:** ra MVP nhanh, kiến trúc mở rộng được nhưng **không xây trước thứ chưa cần**.

**Ba lớp dữ liệu** chi phối mọi quyết định:

| Lớp | Ví dụ | Vòng đời | Cache | Riêng tư |
|---|---|---|---|---|
| **Live** | Kẹt xe, SOS, deal | Phút–giờ, tự hết hạn | 5–15s | Ẩn danh tác giả |
| **Places** | Quán ăn, camping | Vĩnh viễn | 15–30 phút | Công khai |
| **Social** | Bài đăng, checkin, follow | Vĩnh viễn | Riêng từng người | ⚠️ Phức tạp nhất |

Tài liệu chi tiết: `docs/c9-maps-tai-lieu-tong-hop.md` (use case, tech mapping), `docs/tang-xuyen-suot-rate-limit-jwt-i18n.md` (cross-cutting), `docs/cau-hinh-nestjs-modulith.md` (đa instance).

---

## 2. Quyết định đã chốt — KHÔNG mở lại

| Tầng | Chọn | Lý do một dòng | KHÔNG dùng |
|---|---|---|---|
| Backend | **NestJS + TypeScript** | Đội mạnh TS, cùng ngôn ngữ 3 đầu | Java, Go, Django |
| Kiến trúc | **Modular monolith**, chạy `APP_ROLE=all` | Đội nhỏ; tách bằng env var khi cần | Microservices |
| ORM | **Drizzle** | `geometry` chính thức, type từ schema | Prisma, TypeORM |
| DB | **PostgreSQL 16 + PostGIS 3.4** | 10/19 chức năng cần geo | Mongo, MySQL |
| Cache/đếm/ratelimit | **Redis 7** | Một hạ tầng, bốn việc | Memcached, in-memory |
| Queue + cron | **BullMQ** | Trên Redis sẵn có | RabbitMQ, `@nestjs/schedule` |
| Ảnh | **Cloudflare R2** + CDN | Không phí egress, presigned upload | Lưu DB, disk local |
| Push | **FCM + APNs** | Tiêu chuẩn | OneSignal |
| Realtime | **KHÔNG CÓ** — polling + FCM foreground | App đóng thì socket chết | Socket.IO, SSE |
| Tìm kiếm | **PG FTS + `unaccent` + `pg_trgm`** | Đủ tới vài trăm nghìn marker | Elasticsearch |
| Validation | **zod** trong `packages/contracts` | Dùng chung 3 đầu | class-validator |
| Auth | **JWT** 15 phút + refresh 30 ngày xoay vòng, **OTP SMS** | Thị trường VN quen SĐT | Session |
| Mobile | **React Native + Expo + expo-maps** | Cùng TS, OTA update | Flutter |
| Bản đồ | **Google Maps** | POI ở VN tốt hơn Mapbox | Mapbox (mất vector tile) |
| Admin UI | **AdminJS hoặc Refine** | Tránh viết CRUD tay | Tự code |
| Thanh toán | **VNPay / Momo** | Thị trường VN | Stripe (sau) |
| Monorepo | **npm workspaces** | Đơn giản | Nx (sau nếu cần) |
| Hạ tầng gđ 1–2 | **1 EC2 + docker-compose (app×2) + RDS + ElastiCache** | Đơn giản nhất | Swarm/k8s (sau) |

---

## 3. Nguyên tắc bất biến

Claude Code **MUST** tuân thủ. Vi phạm là bug, không phải lựa chọn style.

### 3.1 Đa instance — mọi thứ phải stateless

```
NEVER  giữ state trong RAM sống lâu hơn một request:
       new Map(), new Set(), mảng module-level, biến đếm, cache in-memory
NEVER  dùng @Cron của @nestjs/schedule, setInterval, setTimeout lặp
NEVER  ghi file upload ra disk local
NEVER  lưu session ở server
MUST   mọi state dùng chung → Redis (tạm) hoặc Postgres (bền)
MUST   job định kỳ → BullMQ upsertJobScheduler với id cố định + tz Asia/Ho_Chi_Minh
MUST   dev bằng docker-compose với 2 replica ngay từ đầu
```

Câu tự vấn khi viết bất kỳ biến nào: *"Instance 2 có cần biết cái này không?"* Có → ra ngoài process.

### 3.2 Ranh giới module

```
MUST   chia thư mục theo nghiệp vụ (modules/marker/), KHÔNG theo tầng (controllers/)
MUST   @Module() chỉ export service — NEVER export repository
MUST   shared/ không import từ modules/ (một chiều)
MUST   @Processor nằm trong *-jobs.module.ts riêng, tách khỏi module có @Controller
NEVER  import trực tiếp file bên trong module khác (chỉ qua service đã export)
```

### 3.3 Dữ liệu

```
MUST   khoá chính UUID v7 (time-ordered) cho mọi bảng
MUST   TIMESTAMPTZ, luôn UTC — NEVER dùng TIMESTAMP không TZ
MUST   cột toạ độ: geography(Point, 4326) + index GIST
MUST   ST_DWithin cho tìm bán kính — NEVER ST_Distance(...) < x (không dùng index)
MUST   mọi SQL không gian nằm trong *-geo.repository.ts — NEVER rải trong service
MUST   phân trang bằng cursor (created_at, id) — NEVER OFFSET
MUST   bảng user_locations: một dòng mỗi user, UPSERT — NEVER bảng lịch sử có GIST
MUST   notifications partition theo tháng
MUST   migration là bước riêng trong deploy, hoặc pg_advisory_lock — NEVER chạy tự do lúc boot
```

### 3.4 Quyền riêng tư

```
NEVER  đưa author_id (kể cả đã băm) vào DTO công khai của marker Live
NEVER  cache nội dung đã lọc theo quyền — chỉ cache phần public
MUST   checkin mặc định visibility = 'private'
MUST   băm số điện thoại bằng HMAC có secret — NEVER lưu/log số thô
MUST   push_token gắn với refresh_tokens (thiết bị) — NEVER gắn với users
NEVER  log: token, OTP, mật khẩu, toạ độ chính xác của user, nội dung riêng tư
```

### 3.5 API

```
MUST   server trả mã lỗi (ErrorCodes trong contracts), client dịch — NEVER trả câu tiếng Việt
MUST   response shape: { data, meta } / { error: { code, params, requestId } }
MUST   mọi endpoint ghi có PhoneVerifiedGuard trừ khi @AllowUnverified()
MUST   rate limit khoá theo user → x-device-id → IP (thứ tự đó)
MUST   POST tạo tài nguyên nhạy cảm (SOS, thanh toán, marker, post) nhận Idempotency-Key
MUST   /api/v1 prefix
```

### 3.6 Hành vi của Claude Code

```
MUST   đọc mục 12 và lập kế hoạch trước khi tạo file
NEVER  thêm dependency, xoá file, hoặc sửa schema DB mà không hỏi
NEVER  thêm tính năng, abstraction, hoặc file ngoài phạm vi được yêu cầu
NEVER  tạo file "cho đủ bộ" (thư mục rỗng, interface không dùng, test placeholder)
MUST   sau mỗi bước: liệt kê file đã tạo/sửa và lý do
MUST   dừng và hỏi khi: gặp mâu thuẫn giữa tài liệu, cần quyết định sản phẩm (mục 11), hoặc một bước vượt 15 file
```

---

## 4. Bức tranh cấu hình từng tech

Mô tả **vai trò và cách cấu hình**, không phải code hoàn chỉnh. Claude Code dùng phần này để hiểu ý đồ trước khi viết.

### 4.1 NestJS

| Khía cạnh | Cấu hình |
|---|---|
| Entry | `main.ts` phân nhánh theo `APP_ROLE`: `all` (mặc định) / `api` / `worker` / `admin` |
| Module gốc | `AppModule` = `ApiModule` + `WorkerModule`. `ApiModule` chỉ controller. `WorkerModule` chỉ processor, dùng `createApplicationContext` (không mở port) |
| Global | `ValidationPipe` (zod), `AllExceptionsFilter`, `ThrottlerGuard`, `AuthGuard`, `LoggerModule` (pino) |
| Header | Mọi response có `X-Instance-Id`, `X-Request-Id` |
| Shutdown | `enableShutdownHooks()`; worker đợi job hiện tại xong (`worker.close()`) |
| Swagger | Hai document: `/docs/app` (Identity, Marker, Social, Notification) và `/docs/admin` (Moderation, Billing), qua `include:` |
| Versioning | URI, `/api/v1` |
| Port | Luôn `3000` trong container. Chỉ nginx publish ra host |

### 4.2 PostgreSQL + PostGIS

| Khía cạnh | Cấu hình |
|---|---|
| Extension (migration đầu) | `postgis`, `unaccent`, `pg_trgm`, `uuid-ossp` hoặc hàm uuid v7 |
| Pool | Theo vai trò: api 10, worker 8, admin 5. Tổng < `max_connections`. PgBouncer khi tổng > 50 |
| Toạ độ | `geography(Point, 4326)` qua Drizzle `customType`. Index `USING gist` |
| Marker | Một bảng `markers` cho mọi loại, cột `type` + JSONB `attrs` (validate bằng zod discriminated union ở app) |
| Live | `expires_at` + `trust_score` + `confirmation_count`. Job BullMQ mỗi phút chuyển hết hạn |
| Vị trí user | `user_locations(user_id PK, geom, updated_at, sos_alerts_enabled)`. Partial GIST index `WHERE sos_alerts_enabled` |
| Xã hội | `follows(follower_id, following_id)` PK + index ngược. `posts(author_id, created_at DESC)` index |
| Thông báo | `notifications` partition tháng + partial index `WHERE read_at IS NULL`. `announcements` riêng cho quảng bá |
| Outbox | `outbox_events(id, event_type, payload, created_at, processed_at, attempts)`. Partial index `WHERE processed_at IS NULL` |
| Auth | `refresh_tokens(token_hash UNIQUE, device_id, push_token, expires_at)` |
| RBAC | `roles`, `permissions`, `role_permissions`, `user_roles(user_id, role_id, city_code?)`, `moderator_assignments(marker_types[], region geography)` |
| Kiểm duyệt | `reports(target_type, target_id, reason, status)`, `moderation_log` — có ngay từ đầu |

### 4.3 Drizzle

| Khía cạnh | Cấu hình |
|---|---|
| Schema | `shared/database/schema/*.ts`, một file mỗi nhóm bảng, `index.ts` gom |
| Migration | `drizzle-kit generate` → review → commit. Chạy bằng script riêng trước deploy |
| Geo | `customType` cho `geography`. Hàm không gian qua `sql` template trong `*-geo.repository.ts` |
| Điều kiện động | `and(...)` với `undefined` cho filter tuỳ chọn — NEVER `:x IS NULL OR col = :x` |
| Transaction | `db.transaction(async (tx) => ...)`; outbox ghi trong cùng `tx` |
| Type | Kiểu trả về suy từ schema. Query tổng hợp (cluster) khai kiểu tay + validate zod |

### 4.4 Redis

| Việc | Cấu trúc | Key | TTL |
|---|---|---|---|
| Cache viewport | String (JSON) | `c9:v1:viewport:{zoom}:{tile}:{types}` | 30s (Places), 10s (Live) |
| Cache chi tiết | String | `c9:v1:marker:{id}` | 5 phút, `del` ngay khi sửa |
| Đếm like/follower/unread | String `INCR` | `c9:cnt:{kind}:{id}` | Không TTL, dựng lại từ PG |
| Thống kê shop | Hash `HINCRBY` | `c9:stats:{marker}:{date}` | Gộp xuống PG mỗi giờ |
| Rate limit | Throttler storage | tự quản | theo rule |
| OTP | String | `c9:otp:{hmac(phone)}` | 5 phút |
| Blacklist JWT | String | `c9:revoked:{jti}` | = thời gian còn lại |
| Permission cache | Set | `c9:perms:{userId}` | 5 phút |
| Idempotency | String | `c9:idem:{userId}:{key}` | 24h |
| User online | Sorted Set (heartbeat) | `c9:online` | Tự dọn theo score |
| BullMQ | tự quản | `bull:*` | — |

**Cấu hình:** `maxmemory-policy allkeys-lru` **chỉ** cho DB cache. BullMQ dùng DB khác (`/1`), không đặt eviction. `appendonly yes`. Prefix `v1` đổi thành `v2` để vô hiệu toàn bộ cache khi đổi shape.

**Quy tắc:** dùng cấu trúc Redis tương ứng (`SADD`, `INCR`, `ZADD`) — NEVER đọc JSON → sửa → ghi lại (race condition).

### 4.5 BullMQ

| Queue | Việc | Concurrency | Limiter |
|---|---|---|---|
| `marker-maintenance` | Hết hạn Live, tính trust score | 2 | — |
| `push:critical` | SOS, chỗ nguy hiểm | 20 | 500/s (FCM) |
| `push:contextual` | Kẹt xe, comment, like, follow | 10 | 300/s |
| `push:digest` | Promoted, bài mới, gợi ý | 2 | 100/s, giờ thấp điểm |
| `media` | Resize ảnh (sharp), WebP | 4 | — |
| `stats` | Gộp Redis → PG | 1 | — |
| `outbox` | Drain outbox → queue | 1 | — |

**Repeatable:** `upsertJobScheduler(id cố định, { pattern, tz: 'Asia/Ho_Chi_Minh' })`. **Fan-out:** 2 tầng (planner → sender lô 500). **Chống trùng:** `jobId` cố định + PK `(notification_id, user_id)` + collapse key. **Sweeper:** dòng `sending` > 5 phút → `pending`.

### 4.6 Outbox

Ghi `outbox_events` trong cùng transaction với nghiệp vụ. Worker `SELECT ... FOR UPDATE SKIP LOCKED` → đẩy BullMQ → `processed_at`. `event_type` đặt tên `domain.action` (`marker.created`, `sos.created`, `shop.claimed`) — sẵn làm routing key nếu sau này đổi broker. **Thêm ở giai đoạn 3–4**, không phải tuần 0.

### 4.7 Auth

| Khía cạnh | Cấu hình |
|---|---|
| Access | JWT 15 phút, payload `{sub, jti, did}` — NEVER role/permission trong JWT |
| Refresh | 30 ngày, băm SHA-256 trong PG, xoay mỗi lần dùng, phát hiện tái sử dụng → xoá hết |
| OTP | 6 số, 5 phút, 3 lần gửi/giờ, 5 lần thử/15 phút, khoá theo `hmac(phone)` |
| Social | Google + **Sign in with Apple** (bắt buộc iOS). SĐT là mỏ neo, gộp tài khoản |
| Guard | `AuthGuard` (global, `@Public()` mở) → `PermissionGuard` (`@RequirePermissions`) → `PhoneVerifiedGuard` |
| Quyền | Đọc từ Redis 5 phút, dựng từ PG. Admin đổi quyền → `del` key |

### 4.8 Rate limit

Throttler + Redis storage. Tracker: `u:{userId}` → `d:{x-device-id}` → `ip:{ip}`. Hai tầng mặc định (10/s, 100/phút). Override từng route: OTP 3/giờ/phone, SOS 1/5 phút, tạo Place 5/ngày, report 10/giờ, follow 50/giờ, GET map 300/phút. Trả `429` + `Retry-After`.

### 4.9 i18n

`nestjs-i18n`, resolver: `user.locale` → `Accept-Language` → `vi`. **Chỉ dịch ở server:** push notification (theo locale **người nhận**), tên category (JSONB `names`). **Không dịch ở server:** lỗi API (trả mã), validation (client), nội dung user tạo. ICU MessageFormat cho plural.

### 4.10 Upload

Presigned URL R2, 5 phút, giới hạn 10MB, `image/jpeg|png|webp|heic`. App PUT thẳng. Backend xác nhận object tồn tại → ghi DB → job `media` resize (200px thumb, 800px medium, WebP). NEVER file đi qua backend.

### 4.11 Logging + giám sát

`nestjs-pino`, JSON ra stdout, redact secret. Mọi dòng có `requestId`, `instance`, `userId?`. `requestId` truyền vào job data. Sentry cho 5xx. Prometheus: `/metrics` với p95 viewport, push delivery rate, SOS latency, queue depth, pool usage.

### 4.12 Docker

`docker-compose.yml` dev: `api-1/2` (ports 3001/3002 để test thẳng), `nginx` (3000, `least_conn`, NEVER `ip_hash`), `postgis/postgis:16-3.4`, `redis:7-alpine --appendonly yes`. Health: `/health/live` (process) + `/health/ready` (DB + Redis). `stop_grace_period` 30s api, 60s worker.

---

## 5. Cấu trúc thư mục mục tiêu

```
c9-maps/
├── CLAUDE.md                      ← file này
├── docs/                          ← các tài liệu chi tiết + ADR
│   └── adr/
├── package.json                   # workspaces
├── docker-compose.yml
├── nginx.conf
├── .env.example
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── app.module.ts / api.module.ts / worker.module.ts
│   │   │   ├── config/            # env.schema.ts (zod)
│   │   │   ├── shared/            # database/ redis/ cache/ queue/ events/ storage/ health/ auth/ throttle/ i18n/ filters/ interceptors/ logger/ types/
│   │   │   └── modules/
│   │   │       ├── identity/      # user, auth, otp, rbac, privacy
│   │   │       ├── marker/        # marker, photo, geo, cluster, confirmation, jobs/
│   │   │       ├── social/        # comment, like, checkin, post, follow, feed, profile
│   │   │       ├── moderation/    # report, assignments, log
│   │   │       ├── notification/  # notification, push, badge, announcements, jobs/
│   │   │       └── billing/       # claim, promoted, payment, stats, jobs/
│   │   ├── test/                  # integration (testcontainers)
│   │   ├── drizzle.config.ts
│   │   └── Dockerfile
│   ├── mobile/                    # Expo — KHÔNG dựng ở giai đoạn này
│   └── web/                       # React (đã có)
└── packages/
    ├── contracts/                 # zod schema, ErrorCodes, types
    └── api-client/                # sinh từ OpenAPI (giai đoạn 2)
```

Bên trong mỗi module: `*.module.ts`, `*.controller.ts`, `*.service.ts`, `*.repository.ts`, `*-geo.repository.ts` (nếu có geo), `dto/`, `jobs/*-jobs.module.ts` (nếu có processor), `*.types.ts`. **Không tạo thư mục rỗng.**

---

## 6. Quy ước

| Loại | Quy ước | Ví dụ |
|---|---|---|
| File | kebab-case + hậu tố | `marker-geo.repository.ts` |
| Class | PascalCase | `MarkerGeoRepository` |
| Bảng | snake_case số nhiều | `marker_photos` |
| Cột | snake_case | `created_at`, `sos_alerts_enabled` |
| Cột chuẩn | `id UUID v7`, `created_at`, `updated_at`, `deleted_at?` (soft delete khi cần) | |
| Route | kebab-case số nhiều | `/api/v1/markers/:id/check-ins` |
| Cache key | `c9:v1:{domain}:{id}` | `c9:v1:marker:abc` |
| Queue | `{domain}:{tier}` | `push:critical` |
| Event | `{domain}.{action}` | `marker.created` |
| Error code | SCREAMING_SNAKE | `CHECKIN_TOO_FAR` |
| Env | SCREAMING_SNAKE, validate bằng zod lúc boot | `DATABASE_URL` |
| Commit | Conventional Commits | `feat(marker): viewport clustering` |
| Branch | trunk-based, feature branch ngắn | `feat/marker-viewport` |

---

## 7. Testing

| Tầng | Công cụ | Phạm vi | Chạy ở |
|---|---|---|---|
| Unit | Vitest | Service logic thuần (trust score, gộp thông báo, quantize bbox) | Mỗi commit |
| **Integration** | Vitest + **testcontainers** (Postgres+PostGIS, Redis thật) | Mọi `*-geo.repository.ts`, outbox, BullMQ processor | Mỗi PR |
| E2E | Supertest | 5 luồng: auth OTP, tạo marker + viewport, checkin, SOS fan-out, thanh toán webhook | Mỗi PR |
| Đa instance | Script bash (6 test) | LB, cache, rate limit, cron, JWT, upload | Trước deploy |
| Load | k6 | Viewport 300 req/s, p95 < 100ms | Hàng tuần |

**Quy tắc:** truy vấn PostGIS **không mock** — test trên PostGIS thật. Mỗi truy vấn geo có ít nhất một test có dữ liệu ở ranh giới (đúng 200m, đúng mép bbox).

---

## 8. Môi trường và CI/CD

| Môi trường | Hạ tầng | Dữ liệu |
|---|---|---|
| `local` | docker-compose 2 replica | Seed script |
| `staging` | Giống prod, nhỏ hơn | Ẩn danh từ prod hoặc seed |
| `prod` | EC2 + RDS + ElastiCache (gđ 1–2) | Thật, PITR bật |

**Pipeline:** `lint` → `typecheck` → `arch:check` (dependency-cruiser, thêm khi đội > 3) → `test:unit` → `test:integration` → `build image` → `migrate` (bước riêng) → `deploy` → `smoke` (6 test đa instance). Dừng ở bước đỏ.

**Secrets:** `.env.example` commit, `.env` không. Prod dùng AWS Secrets Manager / Docker secrets. NEVER secret trong image.

---

## 9. Đề xuất thêm — những thứ nên có

Không bắt buộc, nhưng rẻ và đáng:

| Đề xuất | Vì sao | Chi phí |
|---|---|---|
| **ADR** (`docs/adr/NNNN-*.md`) | Mỗi quyết định lớn một file 10 dòng: bối cảnh, lựa chọn, hệ quả. Sáu tháng sau bạn quên vì sao chọn Drizzle | 10 phút/quyết định |
| **UUID v7** thay v4 | Time-ordered → index locality tốt hơn, phân trang cursor tự nhiên | 0 |
| **Feature flags** (bảng `feature_flags` + Redis cache) | Bật/tắt SOS, promoted, deal theo % user hoặc theo city mà không deploy. **Kill switch SOS** khi bị lạm dụng | 1 giờ |
| **Bull Board** (`/admin/queues`) | Nhìn thấy queue depth, job lỗi, retry — debug worker không có nó là mù | 15 phút |
| **Seed script** có dữ liệu thật (OSM Việt Nam) | App không trống ngày đầu; test viewport với 50k marker thật | 1 ngày |
| **Data retention policy** viết ra | `user_locations` giữ 30 ngày, `notifications` 6 tháng, log 14 ngày. Nghị định 13/2023 về dữ liệu cá nhân | 30 phút |
| **User data export/delete** endpoint | Nghĩa vụ pháp lý (PDPD), và người dùng hỏi sẽ hỏi | 2 giờ |
| **Runbook SOS** (`docs/runbook-sos.md`) | Khi có SOS thật lúc 2h sáng, ai làm gì, kill switch ở đâu | 1 giờ |
| **`x-device-id`** từ ngày đầu | Rate limit đúng, thiết bị đúng, push token đúng | 0 |
| **OpenAPI → client codegen** trong CI | Web/mobile không viết HTTP client tay | 1 giờ |
| **Renovate/Dependabot** | Node ecosystem churn — nâng cấp nhỏ đều đặn rẻ hơn nâng lớn | 15 phút |
| **`docs/DECISIONS-PENDING.md`** | Bốn câu chưa chốt (mục 11) nằm một chỗ, không lạc | 5 phút |
| **Chaos nhẹ** trong smoke test | `docker compose kill api-1` giữa chừng — app còn phục vụ không? | 30 phút |
| **Trust score có công thức viết ra** | Tránh "magic number": `score = confirms - 0.5*denies, hiển thị khi ≥ 3, hết hạn khi không confirm mới trong TTL` | 30 phút |
| **Geohash precision bảng** | Zoom 10 → geohash 4, zoom 14 → geohash 6... viết thành hằng số, không tính lung tung | 15 phút |
| **Soft delete có chọn lọc** | Marker, post: soft (`deleted_at`) để kiểm duyệt tra. Like, follow: hard | 0 |

---

## 10. Thứ tự dựng — mỗi bước là một checkpoint

Claude Code làm **từng bước, dừng sau mỗi bước để review**. Không nhảy bước.

| Bước | Phạm vi | Done khi |
|---|---|---|
| **0. Phân tích** | Đọc CLAUDE.md + docs/, viết `docs/PLAN.md`: hiểu gì, mâu thuẫn gì, câu hỏi gì, thứ tự đề xuất | PLAN.md được duyệt |
| **1. Skeleton** | Monorepo, `apps/api` rỗng chạy được, `packages/contracts` rỗng, `.env.example`, `env.schema.ts` | `npm run dev` lên, `/health/live` trả ok |
| **2. Docker** | compose 2 replica + nginx + postgis + redis, `X-Instance-Id` | `curl :3000/health` 10 lần thấy 2 instance |
| **3. Nền dữ liệu** | Drizzle, migration đầu (extensions), `DatabaseModule`, schema `users` | Migration chạy, connect ok |
| **4. Cross-cutting** | `AllExceptionsFilter`, `AppException`, `ErrorCodes`, zod pipe, pino, `RequestId` | Lỗi trả đúng shape, log JSON |
| **5. Redis** | `RedisModule`, `CacheModule`, `cache-keys.ts`, throttler Redis storage | Test rate limit qua 2 instance |
| **6. Auth** | JWT + refresh rotation, OTP (SMS mock), guards, `refresh_tokens` | E2E auth pass |
| **7. Marker core** | Schema `markers` + `marker_photos`, `MarkerGeoRepository` (viewport cluster, nearby), cache viewport | Integration test geo pass với 10k seed |
| **8. Social gđ 2** | comment, like, checkin (`ST_DWithin`), post, follow, feed×3, profile | E2E checkin pass |
| **9. Live + Moderation gđ 3** | Live marker, confirmation, trust score, BullMQ expire, outbox, report, assignments, AdminJS | Job expire log 1 dòng/phút với 2 replica |
| **10. Billing gđ 3** | claim, deal, promoted, VNPay mock, stats | Webhook idempotent test |
| **11. Push + SOS gđ 4** | FCM, 3 queue, fan-out 2 tầng, `notification_deliveries`, badge, i18n push, `user_locations` | SOS E2E: 500 recipients, 0 trùng |

**Bước 0 là bắt buộc và không viết code.** Bước 1–7 là "tuần đầu + giai đoạn 1". Bước 8–11 theo giai đoạn sản phẩm.

---

## 11. Quyết định sản phẩm CHƯA chốt — Claude Code MUST hỏi khi chạm tới

| Câu hỏi | Ảnh hưởng | Khuyến nghị tạm |
|---|---|---|
| Follow hay friend? | Số mức visibility (2 hay 3), mọi query nội dung | Follow, 2 mức |
| Checkin mặc định public hay private? | Schema default, an toàn người dùng | Private |
| Xác thực chủ shop bằng gì? | Luồng claim, chi phí vận hành | Gọi điện |
| SOS đi đến ai? | Toàn bộ thiết kế SOS, pháp lý | Cộng đồng gần + nói rõ không phải cấp cứu |
| Nhắn tin có làm không? | Có/không SSE, 6–10 tuần | Không ở gđ 1–4 |

Cho tới khi chốt, dùng **khuyến nghị tạm** và ghi vào `docs/DECISIONS-PENDING.md`.

---

## 12. Prompt khởi động cho Claude Code

Chạy prompt này **đầu tiên**. Nó chỉ phân tích, không tạo code.

```
Đọc CLAUDE.md và toàn bộ docs/ trong repo này. Chưa tạo hoặc sửa bất kỳ file code nào.

Viết docs/PLAN.md gồm đúng 5 phần:

1. HIỂU: tóm tắt dự án trong 10 dòng — ba lớp dữ liệu, sáu module, quy tắc đa instance quan trọng nhất.
2. MÂU THUẪN: liệt kê mọi chỗ các tài liệu nói khác nhau hoặc chưa rõ. Với mỗi chỗ, nêu hai cách hiểu và cách bạn sẽ chọn nếu không được trả lời.
3. CÂU HỎI: tối đa 7 câu cần tôi trả lời trước khi bắt đầu bước 1. Ưu tiên câu ảnh hưởng schema.
4. KẾ HOẠCH BƯỚC 1–7: với mỗi bước, liệt kê file sẽ tạo (đường dẫn đầy đủ), dependency sẽ cài (tên + lý do), và tiêu chí "done" có thể kiểm tra bằng lệnh.
5. RỦI RO: 5 chỗ bạn thấy dễ sai nhất khi triển khai, và cách phòng.

Ràng buộc:
- Chỉ dùng công nghệ trong mục 2 của CLAUDE.md. Không đề xuất thay thế.
- Không thêm tính năng ngoài mục 10.
- Mỗi phần dưới 400 từ.
- Kết thúc bằng: "Chờ duyệt PLAN.md trước khi bắt đầu bước 1."

Sau khi viết xong, dừng lại.
```

Sau khi duyệt `PLAN.md`, prompt cho từng bước:

```
Thực hiện bước N trong docs/PLAN.md.

Phạm vi: chỉ các file đã liệt kê cho bước N. Không tạo file ngoài danh sách.
Trước khi cài dependency mới hoặc sửa schema: dừng và hỏi.
Sau khi xong: liệt kê file đã tạo/sửa, chạy lệnh kiểm tra "done", dán kết quả.
Không sang bước N+1.
```

---

## 13. Những gì KHÔNG làm ở giai đoạn này

| Thứ | Thêm khi |
|---|---|
| WebSocket / SSE | Chat có typing, hoặc cần < 5s khi app chắc chắn mở |
| Tách `APP_ROLE` thành service riêng | App chậm đúng lúc có đợt push lớn |
| dependency-cruiser boundary rule | Đội > 3 người |
| Outbox | Bước 9 |
| Friend hai chiều | Cần `friends-only` thật |
| Nhắn tin | Sau gđ 4, cân nhắc mua dịch vụ |
| Fan-out on write cho feed | Đo được feed chậm |
| Elasticsearch | > vài trăm nghìn marker |
| Swarm / k8s | Có người dùng thật và một EC2 không đủ |
| Mobile app | Sau khi API bước 7 ổn định |
| Tối ưu chưa đo | Bao giờ có số liệu |

---

*Ba lỗi tốn kém nhất, nhắc cuối cùng: state trong RAM (im lặng, chỉ sai kết quả), `@Cron` (nhân theo replica), bảng vị trí kiểu lịch sử (GIST bloat). Phòng bằng: dev 2 replica, lint rule, UPSERT.*
