# C9 Map — Lộ trình xây dựng

**Cập nhật:** 2026-09-17 (skeleton xong, module mẫu location, chưa bắt đầu bước 7) · **Trạng thái:** Active · **Chủ sở hữu:** Tech Lead
Thứ tự dựng backend theo checkpoint, giai đoạn sản phẩm, và những gì cố ý chưa làm.

---

## 1. Nguyên tắc

```
MUST   mỗi bước là một checkpoint: làm xong → dừng → review → mới sang bước kế
MUST   "Done khi" phải kiểm tra được bằng lệnh hoặc test
MUST   bước 0 (phân tích, PLAN.md) trước mọi file code
NEVER  nhảy bước, gộp bước, hoặc làm trước tính năng của giai đoạn sau
```

## 2. Các bước 0–11

| Bước | Phạm vi | Done khi | Giai đoạn | Trạng thái |
|---|---|---|---|---|
| 0. Phân tích | Đọc docs/, chuẩn hoá tài liệu, lập plan skeleton `plans/260916-1500-c9-map-backend-skeleton/` | Docs chuẩn hoá ✅; plan được user duyệt; plan skeleton 7/7 phase (test unit/integration + CI thuộc phase 07) | — | ✅ 2026-09-17 |
| 1. Skeleton | `nest new` (project đơn, ADR-0006), `config/env.ts` (zod qua `ConfigModule.validationSchema`), `.env.example`, `/health/live` | `nest start --watch` lên, `GET /health/live` → 200 | MVP | ✅ 2026-09-16 |
| 2. Docker & đa instance | compose `postgres` (postgis) + `redis` + `api-1/2` + nginx `least_conn`; Supabase dev project cho auth; `X-Instance-Id` | `curl :3000/health` 10 lần thấy 2 instance id | MVP | ✅ 2026-09-16 |
| 3. Nền dữ liệu | Drizzle + Postgres/PostGIS riêng, migration đầu (postgis, unaccent, pg_trgm), `common/database/drizzle.ts`, `schema/user.schema.ts` | `drizzle-kit migrate` chạy, `/health/ready` → 200 | MVP | ✅ 2026-09-16 |
| 4. Cross-cutting | `AllExceptionsFilter`, `AppException`, `ErrorCodes`, zod pipe, pino + `requestId`, i18n, Swagger theo module | Mọi response đúng shape `{success,code,msg,data,meta}`, `/docs` mở được, `openapi/<module>.json` export | MVP | ✅ 2026-09-16 |
| 5. Redis | `common/redis/{redis.provider,cache,throttler.guard,queue}.ts` | Rate limit đếm chung qua 2 instance; BullMQ sẵn sàng (queue đầu tiên thêm ở bước 9) | MVP | ✅ 2026-09-16 |
| 6. Supabase Auth + RBAC | Verify JWT Google (JWKS), `AuthGuard` + `@Public()`, upsert `profiles` phía app + role `user`, bảng RBAC + seed, `PermissionGuard`, admin API gán role (guard SĐT đã xác minh: gđ 2) | E2E: token Supabase local → `/me` trả profile; token giả → 401 | MVP | ✅ 2026-09-17 |
| 7. Pin core | Schema `markers` + `marker_photos`, `MarkerGeoRepository` (viewport cluster, nearby, duplicate 300 m), cache viewport, presigned upload R2 | Integration test geo pass với 10k seed; p95 viewport < 100 ms local | MVP | ☐ |
| 8. Engagement | Vote (Still/Gone), thread reply, like, report, landmark check-in (`ST_DWithin` 200 m), state machine pin | E2E: vote → pending→live; 3 Gone → removed; check-in xa 200 m → `CHECKIN_TOO_FAR` | MVP | ☐ |
| 9. Live + rep + moderation | Job expire mỗi phút, `reputation_events` + tier, pending/hidden theo nửa tuổi thọ, report có trọng số, outbox, admin dashboard tối thiểu | Job expire log 1 dòng/phút với 2 replica; rep clamp 0–100 test pass | MVP | ☐ |
| 10. Billing / Promoted | Promoted order, cổng VN, webhook idempotent, offer code, stats, hoá đơn | Webhook gửi 2 lần → 1 pin; refund khi pin không lên | 3 | ☐ |
| 11. Push + SOS + Areas | FCM/APNs, 3 queue push, `user_alert_areas` fan-out, `user_locations`, SOS session + Redis live location, emergency contacts, badge engine | SOS E2E: 500 recipients, 0 trùng; area schedule test pass | 2 | ☐ |

Bước 1–7 = tuần đầu + giai đoạn 1. Bước 8–9 hoàn thành MVP. Bước 11 trước bước 10 vì SOS/Areas là giai đoạn 2, Promoted là giai đoạn 3.

## 3. Giai đoạn sản phẩm

| Giai đoạn | Tính năng | Điều kiện bắt đầu |
|---|---|---|
| **MVP** | 7 loại pin, vote/thread/like/report, rep + pending, My areas + push, landmark check-in, auth 4 cách, vi+en, admin tối thiểu | PLAN.md duyệt |
| **2** | SOS + emergency contacts, scenic/fishing, badges đầy đủ, streak, export dữ liệu, pin tự động (crawler), Bull Board, feature flags | MVP có người dùng thật, vòng lặp pin ổn |
| **3** | Promoted pin, thanh toán VN, hoá đơn điện tử, stats venue | Có DAU đủ để venue trả tiền |
| **4** | For sale (reservation, Fair seller), ko/ja, Hà Nội / Đà Nẵng, cảnh báo theo tuyến | Gđ 3 có doanh thu |

Chi tiết phạm vi: [project-overview-pdr.md §14](./project-overview-pdr.md).

## 4. Không làm và khi nào thêm

| Thứ | Thêm khi |
|---|---|
| WebSocket / SSE | Cần < 5 s khi app chắc chắn mở (SOS responder) và polling đo được là không đủ |
| Tách worker (thêm `APP_ROLE`) khỏi all-in-one | API chậm đúng lúc có đợt push lớn (ADR-0006) |
| dependency-cruiser boundary rule | Đội > 3 người |
| Outbox | Bước 9 |
| Chat / nhắn tin | Không có kế hoạch; "Ask seller" = thread |
| Post / follow / feed | Bỏ hẳn |
| Shop claim địa điểm | Bỏ hẳn; Promoted nhập venue tự do |
| Cảnh báo theo tuyến (linestring) | Gđ 4 |
| Elasticsearch | > vài trăm nghìn marker |
| PgBouncer riêng | Supavisor của Supabase không đủ |
| Swarm / k8s | Một EC2 không đủ |
| Tối ưu chưa đo | Bao giờ có số liệu |

## 5. Đề xuất rẻ mà đáng

| Đề xuất | Vì sao | Chi phí | Khi nào |
|---|---|---|---|
| ADR `docs/adr/NNNN-*.md` | Sáu tháng sau quên vì sao chọn | 10 phút/quyết định | Ngay |
| `docs/decisions-pending.md` | Câu chưa chốt nằm một chỗ | 5 phút | Đã có |
| Feature flags (`feature_flags` + Redis) | Kill switch SOS, bật promoted theo % | 1 giờ | Bước 9 |
| Bull Board `/admin/queues` | Debug worker không có nó là mù | 15 phút | Bước 5 |
| Seed OSM HCMC 50k marker | Test viewport thật, app không trống | 1 ngày | Bước 7 |
| Data retention policy viết ra | PDPD; xem PDR §16 | 30 phút | Bước 3 |
| Runbook SOS | Ai làm gì lúc 2h sáng | 1 giờ | Bước 11 |
| `x-device-id` từ ngày đầu | Rate limit + push token đúng thiết bị | 0 | Bước 5 |
| OpenAPI → client codegen trong CI | Mobile không viết HTTP client tay | 1 giờ | Bước 4 |
| Renovate / Dependabot | Nâng nhỏ đều rẻ hơn nâng lớn | 15 phút | Bước 1 |
| Chaos nhẹ trong smoke test (`kill api-1`) | Chứng minh stateless | 30 phút | Bước 2 |
| Trust score có công thức viết ra | Tránh magic number | 30 phút | Bước 9 |
| Geohash precision bảng theo zoom | Hằng số, không tính lung tung | 15 phút | Bước 7 |
| Soft delete có chọn lọc | Marker/thread soft; like/vote hard | 0 | Bước 3 |

## 6. Rủi ro top 5

Xem [project-analysis.md §6](./project-analysis.md): (1) code từ 2 tài liệu mâu thuẫn, (2) cold start, (3) SOS pháp lý, (4) visibility/pending sai → cache lệch, (5) thanh toán/VAT tốn gấp đôi.

## 7. Changelog roadmap

- 2026-09-16 — Khởi tạo. Chốt c9_map, Supabase Auth + Postgres, bỏ Social/claim, đổi thứ tự bước 10/11 theo giai đoạn.
