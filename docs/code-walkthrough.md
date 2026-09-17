# C9 Map — Đọc code từ đâu, file nào để làm gì

**Cập nhật:** 2026-09-17 · **Trạng thái:** Active · **Chủ sở hữu:** Tech Lead
Tài liệu cho người mới mở repo lần đầu (kể cả dev React chưa từng dùng NestJS). Đọc xong 15 phút là biết request đi đâu, file nào sửa khi cần. Chi tiết kỹ thuật hơn: [project-structure-and-flows.md](./project-structure-and-flows.md).

---

## 1. Nếu bạn từng viết React, NestJS là thế này

| NestJS | Nghĩ như trong React/FE | Ở dự án này |
|---|---|---|
| Module | Một feature folder, khai báo nó chứa gì và cho ai dùng | `modules/identity/identity.module.ts` |
| Controller | Bảng route: URL nào → hàm nào. Chỉ nhận request, gọi service, trả kết quả | `identity.controller.ts` |
| Service | Logic nghiệp vụ, không biết gì về HTTP | `identity.service.ts` |
| Repository | Mọi câu SQL. Service không viết SQL | `identity.repository.ts` |
| Provider + inject | Giống Context + hook: khai báo một lần, chỗ nào cần thì "xin" qua constructor | `constructor(private readonly repo: IdentityRepository)` |
| Guard | Route protection: cho vào hay chặn (401/403/429) | `common/auth/*.guard.ts`, `common/redis/throttler.guard.ts` |
| Pipe | Validate form: body/query/param sai → 422 trước khi tới handler | `common/http/validation.ts` |
| Interceptor | Giống axios interceptor phía server: bọc response chung một shape | `common/http/response.ts` |
| Filter | Error boundary: mọi lỗi ném ra đều thành `{ error: { code } }` | `common/http/exceptions.ts` |
| DTO | Kiểu dữ liệu vào/ra, ở đây viết bằng zod và Swagger tự đọc | `modules/identity/dto/*.dto.ts` |
| Schema (Drizzle) | Định nghĩa bảng DB bằng TypeScript, sinh migration SQL | `modules/identity/schema/identity.schema.ts` |

Thứ tự chạy cho **mọi** request: middleware → guard → pipe → controller → service → repository → interceptor. Lỗi ở bất kỳ đâu → filter.

## 2. Đọc theo thứ tự này (10 phút)

1. `src/main.ts` (25 dòng): nạp `.env`, tạo app, gắn Swagger, listen. Hết.
2. `src/app.ts` (30 dòng): app được cấu hình gì: helmet, prefix `/api`, version `v1`, shutdown hooks.
3. `src/app.module.ts` (60 dòng): danh sách module và 6 "lớp bọc" chạy cho mọi request (3 guard, 1 pipe, 1 filter, 1 interceptor). Đây là bản đồ toàn dự án.
4. `src/modules/identity/identity.controller.ts` → `identity.service.ts` → `identity.repository.ts` → `schema/identity.schema.ts`: một feature hoàn chỉnh từ URL tới bảng DB. Module mới copy y hệt.
5. `src/common/auth/auth.guard.ts`: cách một token Google của Supabase biến thành `req.user`.
6. `src/config/env.ts`: toàn bộ biến môi trường, mỗi biến có chú thích.

Chưa cần đọc ngay: `common/redis/throttler.guard.ts` (rate limit, có Lua), `common/database/drizzle.ts` (kiểu toạ độ PostGIS), `modules/queue-board/` (giao diện xem hàng đợi cho ops).

## 3. Một request đi qua đâu: `GET /api/v1/me`

1. **nginx** chia request cho `api-1` hoặc `api-2`, gắn header `X-Request-Id`.
2. `common/http/request-context.middleware.ts`: ghi lại request id, trả thêm header `X-Instance-Id` để biết instance nào phục vụ.
3. `common/redis/throttler.guard.ts`: đếm số request của user/thiết bị/IP trong Redis. Quá 10 lần/giây → **429**, dừng ở đây.
4. `common/auth/auth.guard.ts`: lấy `Authorization: Bearer <token>`, xác minh chữ ký với khoá công khai của Supabase (`common/auth/supabase.ts`). Sai → **401**. Đúng → gọi `IdentityService.ensureProfile` để chắc chắn user đã có dòng trong bảng `profiles` (lần đầu thì tạo), rồi gắn `req.user`.
5. `common/auth/permission.guard.ts`: route có `@RequirePermissions([...])` không? `/me` không có → cho qua. Route admin có → tra quyền từ DB (cache Redis 5 phút), thiếu → **403**.
6. `common/http/validation.ts`: `/me` không có body nên bỏ qua. Route có `@Body({ schema })` thì zod kiểm, sai → **422**.
7. `identity.controller.ts` hàm `me()`: gọi `identity.getMe(user.id)`.
8. `identity.service.ts` hàm `getMe()`: gọi repository lấy profile, role, permission; ghép thành object đúng `MeResponseSchema`.
9. `identity.repository.ts`: các câu `select` Drizzle trên bảng `profiles`, `user_roles`, `roles`.
10. `common/http/response.ts`: bọc kết quả thành `{ data: {...}, meta: { requestId } }`.
11. Nếu bước nào ném lỗi: `common/http/exceptions.ts` biến thành `{ error: { code: 'NOT_FOUND', params, requestId } }` với đúng HTTP status. Client chỉ cần đọc `error.code`.

Đăng nhập: backend **không** làm OAuth. App gọi Supabase để đăng nhập Google, nhận token, gửi token cho backend. Backend chỉ xác minh.

## 4. Job nền: vì sao có `pin.jobs.ts`

Mỗi phút cần quét pin hết hạn. Có 2 instance mà dùng cron trong process thì chạy 2 lần. Nên dùng BullMQ (hàng đợi trên Redis): cả 2 instance cùng đăng ký một lịch **cùng id**, Redis giữ đúng một lịch, mỗi phút sinh một job, một instance nhận. `pin.jobs.ts` có 2 class: `PinScheduler` đăng ký lịch lúc boot, `PinJobs` xử lý job.

## 5. Từng file làm gì, khi nào mở

| File | Làm gì (một câu) | Mở khi |
|---|---|---|
| `main.ts` | Chạy server | Gần như không bao giờ |
| `app.ts` | Cấu hình app dùng chung cho server và lệnh xuất OpenAPI | Đổi prefix, version, helmet |
| `app.module.ts` | Nối module + 6 lớp bọc toàn cục | Thêm module mới |
| `config/env.ts` | Khai báo và validate biến môi trường | Thêm biến env |
| `config/load-env.ts` | Nạp `.env` trước mọi thứ | Không |
| `config/logger.ts` | Log JSON một dòng mỗi request, ẩn token | Đổi field log, thêm redact |
| `config/i18n.ts` | Dịch vi/en cho push notification (bước 11), hiện chưa có gì gọi | Bước 11 |
| `config/openapi.ts` | Hai trang Swagger `/docs/app`, `/docs/admin` + xuất JSON | Đổi mô tả tài liệu |
| `common/common.module.ts` | Gom DB, Redis, queue, Supabase thành một module dùng chung | Thêm hạ tầng mới |
| `common/auth/auth.guard.ts` | Token → `req.user`; định nghĩa cổng `AUTH_USER` để guard gọi được IdentityService | Đổi cách xác thực |
| `common/auth/permission.guard.ts` | Kiểm `@RequirePermissions` | Hiếm |
| `common/auth/supabase.ts` | Xác minh JWT bằng JWKS; gọi Supabase Admin API (xoá user) | Đổi issuer, thuật toán |
| `common/auth/decorators.ts` | `@Public()`, `@RequirePermissions()`, `@CurrentUser()` | Thêm decorator |
| `common/database/drizzle.ts` | Kết nối Postgres, kiểu cột toạ độ `geography(Point)` | Thêm kiểu cột PostGIS |
| `common/database/schema.ts` | Gom mọi `*.schema.ts` cho Drizzle | Thêm module có bảng |
| `common/redis/cache.ts` | Kết nối Redis + 5 thao tác cache + danh sách key/TTL đang dùng | Thêm key cache |
| `common/redis/queue.ts` | Kết nối BullMQ + tên các queue | Thêm queue |
| `common/redis/throttler.guard.ts` | Rate limit đếm chung mọi instance | Đổi giới hạn |
| `common/http/exceptions.ts` | Bảng mã lỗi + filter | Thêm mã lỗi |
| `common/http/response.ts` | Bọc `{ data, meta }` | Thêm phân trang (bước 7) |
| `common/http/validation.ts` | Pipe zod toàn cục | Hiếm |
| `common/http/request-context.middleware.ts` | `X-Request-Id`, `X-Instance-Id` | Hiếm |
| `common/http/express.d.ts` | Khai `req.user` cho TypeScript | Thêm field vào `req.user` |
| `modules/health/*` | `/health/live` (process sống), `/health/ready` (DB + Redis ok) | Thêm dependency cần check |
| `modules/identity/*` | `/me`, RBAC, admin gán role | Mọi thứ về user |
| `modules/pin/pin.constants.ts` | Hằng số nghiệp vụ pin: tuổi thọ, rate limit, tier rep | Đổi luật chơi |
| `modules/pin/pin.jobs.ts` | Lịch + worker hết hạn pin | Bước 9 |
| `modules/queue-board/*` | Trang `/admin/queues` xem hàng đợi, cần quyền `queue:read` | Ops |

## 6. Thêm một API mới (ví dụ `POST /api/v1/pins`)

1. `modules/pin/schema/pin.schema.ts`: khai bảng `markers` bằng Drizzle → `npm run db:generate` → sửa SQL nếu cần → `npm run db:migrate`. Thêm `export * from` vào `common/database/schema.ts`.
2. `modules/pin/dto/create-pin.dto.ts`: zod schema cho body và response.
3. `modules/pin/pin.repository.ts`: câu SQL insert/select.
4. `modules/pin/pin.service.ts`: luật nghiệp vụ (rate limit tạo pin, tier rep...). Ném `new AppException('CONFLICT', {...})` khi vi phạm.
5. `modules/pin/pin.controller.ts`: `@Post() create(@Body({ schema }) body, @CurrentUser() user)`. Cần quyền → `@RequirePermissions(['pin:create'])`.
6. `pin.module.ts`: thêm controller/provider. `app.module.ts` đã import `PinModule` và `OPENAPI_DOCS` đã có `PinModule` → Swagger tự hiện.
7. Test: unit cho luật ở service (`test/unit/`), integration gọi thật qua supertest (`test/integration/`).

## 7. Những thứ cố ý chưa có

Không viết trước cái chưa dùng. Khi bước tương ứng tới thì thêm, kèm test:
- Phân trang cursor và `meta.nextCursor` (bước 7, endpoint list đầu tiên).
- Helper zod strip HTML cho text người dùng, kiểm toạ độ WGS84 (bước 7, khi có body chứa text/toạ độ).
- `INCR`, `SADD` trong `CacheService` (bước 8, đếm vote/like).
- Gọi `i18n.t()` (bước 11, push notification). Module i18n đã nối sẵn vì đã có test và thư mục `i18n/`.
- Tách worker khỏi HTTP bằng biến env (chỉ khi push fan-out làm API chậm, xem ADR-0006).
