# C9 Map — Đọc code từ đâu, file nào để làm gì

**Cập nhật:** 2026-09-17 · **Trạng thái:** Active · **Chủ sở hữu:** Tech Lead
Tài liệu cho người mới mở repo lần đầu (kể cả dev React chưa từng dùng NestJS). Đọc xong 15 phút là biết request đi đâu, file nào sửa khi cần. Chi tiết kỹ thuật hơn: [project-structure-and-flows.md](./project-structure-and-flows.md).

---

## 1. Nếu bạn từng viết React, NestJS là thế này

| NestJS | Nghĩ như trong React/FE | Ở dự án này |
|---|---|---|
| Module | Một feature folder, khai báo nó chứa gì và cho ai dùng | `modules/user/user.module.ts` |
| Controller | Bảng route: URL nào → hàm nào. Chỉ nhận request, gọi service, trả kết quả | `user.controller.ts` |
| Service | Logic nghiệp vụ, không biết gì về HTTP | `user.service.ts` |
| Repository | Mọi câu SQL. Service không viết SQL | `user.repository.ts` |
| Provider + inject | Giống Context + hook: khai báo một lần, chỗ nào cần thì "xin" qua constructor | `constructor(private readonly repo: UserRepository)` |
| Guard | Route protection: cho vào hay chặn (401/403/429) | `common/auth/*.guard.ts`, `common/redis/throttler.guard.ts` |
| Pipe | Validate form: body/query/param sai → 422 trước khi tới handler | `common/http/validation.ts` |
| Interceptor | Giống axios interceptor phía server: bọc response chung một shape | `common/http/response.ts` |
| Filter | Error boundary: mọi lỗi ném ra đều thành `{ success: false, code, msg, … }` | `common/http/exceptions.ts` |
| DTO | Kiểu dữ liệu vào/ra, ở đây viết bằng zod và Swagger tự đọc | `modules/user/dto/*.dto.ts` |
| Schema (Drizzle) | Định nghĩa bảng DB bằng TypeScript, sinh migration SQL | `modules/user/schema/user.schema.ts` |

Thứ tự chạy cho **mọi** request: middleware → guard → pipe → controller → service → repository → interceptor. Lỗi ở bất kỳ đâu → filter.

## 2. Đọc theo thứ tự này (10 phút)

1. `src/main.ts` (25 dòng): nạp `.env`, tạo app, gắn Swagger, listen. Hết.
2. `src/app.ts` (30 dòng): app được cấu hình gì: helmet, prefix `/api`, version `v1`, shutdown hooks.
3. `src/app.module.ts` (60 dòng): danh sách module và 6 "lớp bọc" chạy cho mọi request (3 guard, 1 pipe, 1 filter, 1 interceptor). Đây là bản đồ toàn dự án.
4. `src/modules/location/`: module mẫu, đọc `location.controller.ts` → `location.service.ts` → `location.repository.ts` → `schema/location.schema.ts` → `dto/`. Một feature hoàn chỉnh từ URL tới bảng DB, kể cả PostGIS và phân trang. Module mới copy y hệt (mục 6).
5. `src/common/auth/auth.guard.ts`: cách một token Google của Supabase biến thành `req.user`.
6. `src/config/env.ts`: toàn bộ biến môi trường, mỗi biến có chú thích.

Chưa cần đọc ngay: `common/redis/throttler.guard.ts` (rate limit, có Lua), `common/database/columns.ts` (parse toạ độ PostGIS), `modules/queue-board/` (giao diện xem hàng đợi cho ops).

## 3. Một request đi qua đâu: `GET /api/v1/me`

1. **nginx** chia request cho `api-1` hoặc `api-2`, gắn header `X-Request-Id`.
2. `common/http/request-context.middleware.ts`: ghi lại request id, trả thêm header `X-Instance-Id` để biết instance nào phục vụ.
3. `common/redis/throttler.guard.ts`: đếm số request của user/thiết bị/IP trong Redis. Quá 10 lần/giây → **429**, dừng ở đây.
4. `common/auth/auth.guard.ts`: lấy `Authorization: Bearer <token>`, xác minh chữ ký với khoá công khai của Supabase (`common/auth/supabase.ts`). Sai → **401**. Đúng → gọi `UserService.ensureProfile` để chắc chắn user đã có dòng trong bảng `profiles` (lần đầu thì tạo), rồi gắn `req.user`.
5. `common/auth/permission.guard.ts`: route có `@RequirePermissions([...])` không? `/me` không có → cho qua. Route admin có → tra quyền từ DB (cache Redis 5 phút), thiếu → **403**.
6. `common/http/validation.ts`: `/me` không có body nên bỏ qua. Route có `@Body({ schema })` thì zod kiểm, sai → **422**.
7. `user.controller.ts` hàm `me()`: gọi `users.getMe(user.id)`.
8. `user.service.ts` hàm `getMe()`: gọi repository lấy profile, role, permission; ghép thành object đúng `MeResponseSchema`.
9. `user.repository.ts`: các câu `select` Drizzle trên bảng `profiles`, `user_roles`, `roles`.
10. `common/http/response.ts`: bọc kết quả thành `{ success: true, code: "OK", msg: "", data, meta: { requestId } }`.
11. Nếu bước nào ném lỗi: `common/http/exceptions.ts` trả **cùng 5 field** với `success: false`, `code: 'NOT_FOUND'`, `msg` đã dịch theo `Accept-Language`, `data: null`, chi tiết trong `meta`. HTTP status vẫn đúng (404). Client rẽ nhánh theo `code`, hiển thị `msg`.

Đăng nhập: backend **không** làm OAuth. App gọi Supabase để đăng nhập Google, nhận token, gửi token cho backend. Backend chỉ xác minh.

## 4. Job nền (BullMQ) khi cần

Chưa có module nào dùng. Khi cần việc chạy nền hoặc theo lịch (ví dụ quét pin hết hạn mỗi phút): có 2 instance mà dùng cron trong process thì chạy 2 lần, nên dùng BullMQ (hàng đợi trên Redis db1, đã cấu hình sẵn ở `common/redis/queue.ts`). Cách làm: thêm tên queue vào `QUEUES`, `BullModule.registerQueue` trong module, `@Processor` trong `<x>.jobs.ts`; lịch thì `queue.upsertJobScheduler(id cố định)` lúc boot, cả 2 instance cùng đăng ký nhưng Redis chỉ giữ một lịch, mỗi lần chỉ một worker nhận. Xem hàng đợi ở `/admin/queues`.

## 5. Từng file làm gì, khi nào mở

| File | Làm gì (một câu) | Mở khi |
|---|---|---|
| `main.ts` | Chạy server | Gần như không bao giờ |
| `app.ts` | Cấu hình app dùng chung cho server và lệnh xuất OpenAPI | Đổi prefix, version, helmet |
| `app.module.ts` | Nối module + 6 lớp bọc toàn cục | Thêm module mới |
| `config/env.ts` | Khai báo và validate biến môi trường (ConfigModule đọc `.env`, dùng qua `ConfigService`) | Thêm biến env |
| `config/logger.ts` | Log JSON một dòng mỗi request, ẩn token | Đổi field log, thêm redact |
| `config/i18n.ts` | Đa ngôn ngữ vi/en: chỉ header `Accept-Language` quyết định (mặc định vi); câu chữ ở `i18n/<lang>/*.json` | Thêm ngôn ngữ, đổi cách chọn |
| `config/openapi.ts` | Swagger `/docs` chia theo module (dropdown), Servers, Schemas từ `.meta({ id })`, tự ghi quyền/public vào mô tả từ metadata guard, `envelope()`, xuất `openapi/<key>.json` | Đổi mô tả tài liệu, thêm server |
| `common/common.module.ts` | Gom DB, Redis, queue, Supabase thành một module dùng chung; đóng kết nối khi app tắt | Thêm hạ tầng mới |
| `common/auth/auth.guard.ts` | Token → `req.user`; định nghĩa cổng `AUTH_USER` để guard gọi được UserService | Đổi cách xác thực |
| `common/auth/permission.guard.ts` | Kiểm `@RequirePermissions` | Hiếm |
| `common/auth/supabase.ts` | Xác minh JWT bằng JWKS; gọi Supabase Admin API (xoá user) | Đổi issuer, thuật toán |
| `common/auth/decorators.ts` | `@Public()`, `@RequirePermissions()`, `@CurrentUser()` | Thêm decorator |
| `common/database/drizzle.ts` | Kết nối Postgres + Drizzle client | Hiếm |
| `common/database/columns.ts` | Cột dùng chung cho schema: timestamps, uuid v7, toạ độ `geography(Point)` | Thêm kiểu cột mới |
| `common/database/schema.ts` | Gom mọi `*.schema.ts` cho Drizzle | Thêm module có bảng |
| `common/redis/redis.provider.ts` | Kết nối Redis db0, đóng khi tắt | Hiếm |
| `common/redis/cache.ts` | Bảng `CACHE` (key + TTL từng mục) + `CacheService` 5 thao tác | Thêm key cache |
| `common/redis/queue.ts` | Kết nối BullMQ + tên các queue | Thêm queue |
| `common/redis/throttler.guard.ts` | Rate limit đếm chung mọi instance | Đổi giới hạn |
| `common/http/exceptions.ts` | Bảng mã lỗi + filter dịch `msg` | Thêm mã lỗi (kèm câu trong `i18n/*/errors.json`) |
| `common/http/response.ts` | Bọc mọi response thành `{ success, code, msg, data, meta }` | Hiếm |
| `common/http/pagination.ts` | Cursor phân trang + `pageOf()` | Viết endpoint list |
| `common/http/validation.ts` | Pipe zod toàn cục | Hiếm |
| `common/http/request-context.middleware.ts` | `X-Request-Id`, `X-Instance-Id` | Hiếm |
| `common/http/express.d.ts` | Khai `req.user` cho TypeScript | Thêm field vào `req.user` |
| `modules/health/*` | `/health/live` (process sống), `/health/ready` (DB + Redis ok) | Thêm dependency cần check |
| `modules/user/*` | `/me`, RBAC, admin gán role | Mọi thứ về user |
| `modules/location/*` | Module mẫu: địa điểm đã lưu, đủ mọi loại file | Khi tạo module mới |
| `modules/queue-board/*` | Trang `/admin/queues` xem hàng đợi, cần quyền `queue:read` | Ops |

## 6. Thêm một API mới: copy module mẫu `modules/location/`

`location` là module mẫu chạy thật (địa điểm đã lưu của user: tên + toạ độ + bán kính, sau này thành "My areas"). Nó có đủ mọi loại file, đọc theo thứ tự này:

| File | Bạn học được gì |
|---|---|
| `schema/location.schema.ts` | Khai bảng bằng Drizzle, cột toạ độ PostGIS, index GIST, khoá ngoại cascade. Sinh migration: `npm run db:generate` rồi sửa tay dòng `geography` bị đặt trong nháy. |
| `dto/create-location.dto.ts` | Schema zod cho body, dùng `zText` (strip HTML) và `zLatLng`. Số giới hạn lấy từ `location.constants.ts`. |
| `dto/location.dto.ts` | Response schema + mapper `toLocationResponse(row)` ngay dưới, query phân trang, query nearby. Một file cho một use case, cả request lẫn response lẫn mapper. |
| `location.repository.ts` | Mọi SQL: insert/returning, cursor `(created_at, id)`, `ST_DWithin` + `ST_Distance` theo mét thật. Mọi query lọc theo `userId`. |
| `location.service.ts` | Luật: tối đa 20 địa điểm, của người khác trả `NOT_FOUND` (không lộ), `pageOf()` tính `nextCursor`. Không map dữ liệu, chỉ gọi `toLocationResponse`. |
| `location.controller.ts` | Hai nhóm route trong một file: `LocationController` cần token (POST, GET list, GET :id, DELETE :id) và `LocationPublicController` không cần đăng nhập (`GET /public/locations/nearby`, `@Public()` ở class, chỉ trả trường an toàn). Chỉ khai route, gắn schema, gọi service. |
| `location.module.ts` | Khai controller + provider. Không import DB/Redis vì `CommonModule` là `@Global`. |
| `test/unit/location.service.spec.ts` | Test luật với repository giả cùng interface. |
| `test/integration/location.spec.ts` | Gọi HTTP thật qua supertest trên PostGIS thật, token ký bởi Supabase giả (`test/setup/jwks.ts`): 422, cách ly user, public nearby không token + biên 299 m / 301 m, cursor đi hết, giới hạn 20. |

Các bước khi làm module `pin`:
1. Tạo `modules/pin/` với đúng bộ file trên, đổi tên `location` → `pin`.
2. Schema → `npm run db:generate` → sửa SQL → `npm run db:migrate`. Thêm `export *` vào `common/database/schema.ts`.
3. Đăng ký `PinModule` trong `app.module.ts` và thêm một mục `OPENAPI_DOCS` (key `pins`, title `Pins`) để Swagger hiện.
4. Cần quyền → `@RequirePermissions(['pin:create'])` trên route; permission phải có trong seed `drizzle/0002_seed_rbac.sql`.
5. Viết test unit cho luật, integration cho SQL và HTTP. Chạy `npm test`.

## 7. Những thứ cố ý chưa có

Không viết trước cái chưa dùng. Khi bước tương ứng tới thì thêm, kèm test:
- `INCR`, `SADD` trong `CacheService` (bước 8, đếm vote/like).
- Cache viewport trong Redis (bước 7, khi có endpoint viewport của pin).
- Template push notification trong `i18n/*/common.json` (bước 11).
- Tách worker khỏi HTTP bằng biến env (chỉ khi push fan-out làm API chậm, xem ADR-0006).

## 8. Module lớn lên và hai module nối với nhau

### 8.1 Thêm bảng phụ cho một module (ví dụ ảnh của địa điểm)

Bảng phụ vẫn thuộc module đó. Thứ tự mở rộng, mỗi bước chỉ chạm một loại file:

1. **Bảng:** thêm `schema/location-photo.schema.ts`, FK về `saved_locations` (import từ `location.schema.ts`), `npm run db:generate`, thêm `export *` vào `common/database/schema.ts`.
2. **SQL:** thêm hàm vào `location.repository.ts`. Bảng phụ có nhiều query → `location-photo.repository.ts` (một repository một bảng chính). Join viết bằng `innerJoin`, không dùng `relations()`/`db.query` ở MVP.
3. **Luật:** thêm hàm vào `location.service.ts`; vượt ~150 dòng → `location-photo.service.ts`.
4. **Route:** thêm vào `location.controller.ts`; nhóm route phụ rõ (`/locations/:id/photos`) → `location-photo.controller.ts`.
5. **Module phình:** gốc module vượt ~10 file → phần phụ thành module riêng (ảnh dùng chung cho pin nữa → `modules/media/`). Không bao giờ tách thư mục theo loại.

Không có "entity": kiểu một dòng là `typeof table.$inferSelect` (ví dụ `SavedLocationRow`), Drizzle sinh sẵn. Luật nghiệp vụ nằm trong service, dữ liệu là object thuần (không DDD, theo PDR).

### 8.2 Hai module nối với nhau (ví dụ `post` gắn với `location`)

Nguyên tắc duy nhất: **phụ thuộc đi một chiều.** `post` biết `location`, `location` không biết `post`. Ba tầng nối:

| Tầng | Cách làm | Ví dụ |
|---|---|---|
| DB | FK trong schema của module phụ thuộc, import bảng của module kia. Chọn hành vi xoá ngay lúc khai: `cascade` (xoá địa điểm thì xoá post) hoặc `set null` (post còn, mất liên kết) | `post.schema.ts`: `locationId: uuid('location_id').references(() => savedLocations.id, { onDelete: 'set null' })` |
| Đọc | Repository của `post` được **join** bảng `saved_locations` để trả tên/toạ độ kèm post (tránh N+1). Không copy tên địa điểm vào bảng post: đổi tên ở location là post thấy ngay, không phải "đồng bộ" gì | `postRepository.findPage()` join `savedLocations` lấy `name`, `point` |
| Ghi / luật | `PostModule` import `LocationModule`; `PostService` inject `LocationService` (đã export) để kiểm luật trước khi ghi. **Không** inject `LocationRepository` của module khác, không ghi thẳng vào bảng của module khác | tạo post: `await this.locations.get(userId, dto.locationId)` → NOT_FOUND nếu không phải của user |

Ghi hai bảng của hai module trong **một transaction** (hiếm): repository của module chủ (`post`) mở `db.transaction` và insert cả hai bảng, import schema của module kia chỉ cho bước ghi đó. Ghi chú lý do ngay trên hàm.

Chiều ngược (location cần biết post, ví dụ đếm số post hoặc xoá địa điểm phải dọn post): **không** gọi ngược từ location sang post. Dùng FK `cascade`/`set null` để DB tự dọn, hoặc đếm bằng query join phía post khi cần hiển thị. Nếu sau này thật sự cần "location xảy ra X thì post làm Y" thì thêm event (`@nestjs/event-emitter`) — thêm dependency phải hỏi, chưa cần ở MVP.

Vòng phụ thuộc (`post` → `location` → `post`) là lỗi thiết kế: Nest báo lỗi lúc boot hoặc phải dùng `forwardRef`. Gặp tình huống đó thì tách phần chung ra module thứ ba, không dùng `forwardRef`.

