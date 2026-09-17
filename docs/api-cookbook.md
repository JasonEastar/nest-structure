# C9 Map — Sổ tay viết API

**Cập nhật:** 2026-09-17 · **Trạng thái:** Active · **Chủ sở hữu:** Tech Lead
Cách bắt đầu code, đặt tên API, nhận input, validate, trả response, ném lỗi, hiện lên Swagger. Mọi đoạn code đều lấy từ module mẫu `src/modules/location/`. Đọc [code-walkthrough.md](./code-walkthrough.md) trước nếu chưa biết request đi qua đâu.

---

## 1. Chạy được trong 5 phút

```bash
cp .env.example .env            # điền SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY (Dashboard → API keys)
npm install
npm run dev:infra               # Postgres + PostGIS, Redis (Docker). Port host: PG_HOST_PORT / REDIS_HOST_PORT trong .env
npm run dev:tools               # (tuỳ chọn) RedisInsight http://localhost:5540 để xem key Redis; Postgres: npm run db:studio
npm run db:migrate              # tạo bảng + seed role/permission
npm run dev                     # http://localhost:3000, sửa file là tự reload
open http://localhost:3000/docs              # Swagger UI, dropdown 'Select a definition' chọn module
TOKEN=$(node scripts/dev-token.mjs)          # token Supabase thật, không cần bấm Google
curl -H "authorization: Bearer $TOKEN" localhost:3000/api/v1/me
```

Trong Swagger bấm **Authorize**, dán token → gọi thử mọi API. Tài khoản dev-token có role `user`; muốn gọi API admin thì gán role `admin` qua `PUT /api/v1/admin/users/:id/roles` bằng một tài khoản admin, hoặc `UPDATE` trực tiếp bảng `user_roles` lần đầu.

## 2. Đặt tên API

| Quy tắc | Đúng | Sai |
|---|---|---|
| Danh từ số nhiều, kebab-case, không động từ trong path | `GET /api/v1/locations` · `/saved-places` | `/getLocations` · `/location` |
| Chi tiết theo id | `GET /locations/:id` | `/locations/detail?id=` |
| Tài nguyên con | `GET /locations/:id/photos` | `/location-photos?locationId=` |
| Truy vấn đặc biệt = path tĩnh, khai **trước** `:id` | `GET /locations/mine-count` | `/locations/:id` khai trước → `mine-count` bị hiểu là id |
| API công khai (không đăng nhập) | `GET /public/locations/nearby`: class thứ hai `<X>PublicController` trong cùng `<x>.controller.ts`, `@Public()` ở class, không `@ApiBearerAuth`, chỉ trả trường an toàn | `@Public()` rải trên từng route của controller thường |
| Hành động không phải CRUD (hiếm) | `POST /pins/:id/vote` · `POST /pins/:id/report` | `PUT /pins/:id?action=vote` |
| API quản trị | `/admin/...`: class thứ hai `<X>AdminController` trong cùng `<x>.controller.ts`, `@RequirePermissions([...])` ở class. Swagger tự ghi "Quyền cần có" | tự viết "cần quyền X" vào mô tả (sẽ lệch với guard) |
| Version | tự động `/api/v1/...` (`app.ts`), controller không ghi `v1` | `@Controller('v1/locations')` |

Tên hàm trong controller = `operationId` trong OpenAPI (mobile codegen dùng tên này): `list`, `get`, `create`, `update`, `remove`, `nearby`. Tên method HTTP: `GET` đọc · `POST` tạo hoặc hành động · `PUT` thay toàn bộ · `PATCH` sửa một phần · `DELETE` xoá.

## 3. Bộ file cho một API mới

```
modules/<x>/
├── <x>.controller.ts     # route + schema + gọi service        (mục 4, 5, 7, 8)
├── <x>.service.ts        # luật nghiệp vụ, ném AppException     (mục 6)
├── <x>.repository.ts     # SQL Drizzle
├── <x>.constants.ts      # số giới hạn, hằng nghiệp vụ
├── dto/<use-case>.dto.ts # zod: request + response của use case (mục 5)
└── schema/<x>.schema.ts  # bảng
```

Thứ tự viết: schema → migrate → dto → repository → service → controller → test. Đăng ký module trong `app.module.ts` (`imports`) và thêm/gộp vào một định nghĩa trong `OPENAPI_DOCS` (key, title, description, tags, modules).

## 4. Nhận input: param, query, body, header, user

```ts
// location.controller.ts
@ApiTags('Locations')            // tag trong Swagger, viết hoa chữ đầu; mô tả tag khai ở OPENAPI_DOCS
@ApiBearerAuth('supabase')       // nút Authorize áp cho cả controller
@Controller('locations')         // → /api/v1/locations
export class LocationController {
  constructor(private readonly locations: LocationService) {}

  @Post()                                                       // 201 mặc định
  create(@CurrentUser() user: AuthUser, @Body({ schema: CreateLocationSchema }) body: CreateLocation) {
    return this.locations.create(user.id, body);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query({ schema: ListLocationsQuerySchema }) query: ListLocationsQuery) {
    return this.locations.list(user.id, query);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', { schema: z.uuid() }) id: string) {
    return this.locations.get(user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)                              // 204, không body
  async remove(@CurrentUser() user: AuthUser, @Param('id', { schema: z.uuid() }) id: string): Promise<void> {
    await this.locations.remove(user.id, id);
  }
}
```

| Cần | Viết | Ghi chú |
|---|---|---|
| Path param | `@Param('id', { schema: z.uuid() })` | Sai → 422, không tới handler |
| Query | `@Query({ schema: XQuerySchema })` | Query luôn là string → dùng `z.coerce.number()` trong schema |
| Body | `@Body({ schema: XSchema })` | Kiểu TS lấy bằng `z.infer` trong file dto |
| User đang đăng nhập | `@CurrentUser() user: AuthUser` | `user.id` = `sub` của Supabase. Route không có `@Public()` là bắt buộc token |
| Header | `@Headers('x-device-id') deviceId?: string` | Chỉ khi thật cần; device id đã được AuthGuard ghi nhận sẵn |
| Route công khai | `@Public()` ở class `<X>PublicController` (cùng file `<x>.controller.ts`), path `public/<resource>` | Không có `req.user`; dữ liệu trả về phải là thứ ai cũng được xem; rate limit vẫn áp theo thiết bị/IP |
| Cần quyền | `@RequirePermissions(['pin:create'])` | Mã quyền phải có trong `drizzle/0002_seed_rbac.sql` |

## 5. Validate bằng zod (file dto)

```ts
// dto/create-location.dto.ts — một file cho một use case, có cả request lẫn response
export const CreateLocationSchema = z.object({
  name: zText(LOCATION_LIMITS.nameMaxLength),   // trim, bỏ thẻ HTML, 1..60 ký tự
  ...zLatLng.shape,                              // lat -90..90, lng -180..180
  radiusMeters: z.number().int().min(100).max(5_000).default(500),
});
export type CreateLocation = z.infer<typeof CreateLocationSchema>;

// dto/location.dto.ts
export const LocationResponseSchema = z.object({
  id: z.uuid(), name: z.string(), lat: z.number(), lng: z.number(),
  radiusMeters: z.number().int(), createdAt: z.iso.datetime(),
});
export const ListLocationsQuerySchema = PaginationQuerySchema;                 // ?cursor=&limit=
export const NearbyLocationsQuerySchema = z.object({                          // GET /public/locations/nearby
  lat: z.coerce.number().min(-90).max(90),                                     // query là string → coerce
  lng: z.coerce.number().min(-180).max(180),
  radiusMeters: z.coerce.number().int().min(1).max(20_000).default(1_000),
});
```

Sai → **422** với body:

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "Dữ liệu gửi lên không hợp lệ",
             "params": { "issues": [{ "path": "lat", "message": "Too big: expected number to be <=90" }] }, "requestId": "…" } }
```

`message` dịch theo ngôn ngữ request; `issues[].message` là câu kỹ thuật của zod (tiếng Anh) để dev debug, không hiển thị cho người dùng. Số giới hạn để trong `<x>.constants.ts`, không viết số trong schema. Helper có sẵn: `zText(max, min?)`, `zLatLng`, `PaginationQuerySchema`. Cần enum: `z.enum(['traffic_jam', 'flooding'])`. Cần field tuỳ chọn: `.optional()` (không gửi) khác `.nullable()` (gửi `null`).

## 6. Trả response và ném lỗi

Controller `return` dữ liệu thuần, interceptor bọc thành envelope. Client luôn đọc `body.data`.

```json
{ "data": { "id": "…", "name": "Nhà", "lat": 10.7798, "lng": 106.699, "radiusMeters": 500, "createdAt": "2026-09-17T04:00:00.000Z" },
  "meta": { "requestId": "01a0…" } }
```

| Tình huống | Viết | Kết quả |
|---|---|---|
| Tạo | `@Post()` return object | 201 + envelope |
| Đọc | `@Get()` return object | 200 |
| Xoá / không có gì trả | `@HttpCode(HttpStatus.NO_CONTENT)` + `Promise<void>` | 204 |
| Danh sách phân trang | service: `return pageOf(rows, query.limit, (r) => ({ createdAt: r.createdAt, id: r.id }))` sau khi repository lấy `limit + 1` dòng | `meta.nextCursor` = chuỗi hoặc `null`; client gửi lại `?cursor=` |
| Lỗi nghiệp vụ | `throw new AppException('NOT_FOUND', { resource: 'location', id })` | `{ error: { code, message, params, requestId } }` đúng HTTP status; `message` = câu trong `i18n/<lang>/errors.json` (`NOT_FOUND` + `resource.location` → "Không tìm thấy địa điểm") |
| Lỗi mới chưa có mã | thêm vào `ErrorCodes` trong `common/http/exceptions.ts` kèm status, thêm câu cùng tên vào `i18n/vi/errors.json` và `i18n/en/errors.json` | Cần câu riêng theo tình huống: `params.reason` + key `CODE_REASON` (vd `CONFLICT_LIMIT_REACHED`) |

Ngôn ngữ: chỉ header `Accept-Language: vi | en` (mặc định vi), client tự gắn header khi gọi; không nhận qua query hay body. Mã lỗi hiện có: `VALIDATION_FAILED` 422 · `NOT_FOUND` 404 · `UNAUTHENTICATED` 401 · `FORBIDDEN` 403 · `RATE_LIMITED` 429 · `CONFLICT` 409 · `BAD_REQUEST` 400 · `PAYLOAD_TOO_LARGE` 413 · `SERVICE_UNAVAILABLE` 503 · `INTERNAL` 500. Lỗi 5xx bất ngờ (throw Error thường) tự thành `INTERNAL`, stack chỉ ghi log.

Map row DB sang response bằng hàm `toXxxResponse(row)` đặt **ngay dưới response schema trong file dto** (ví dụ `toLocationResponse` trong `dto/location.dto.ts`). Service gọi hàm đó, controller không tự ghép object. Đổi shape thì sửa schema và mapper cùng một chỗ. Dữ liệu của người khác trả `NOT_FOUND`, không trả `FORBIDDEN` (không lộ tồn tại).

## 7. Hiện đúng trên Swagger

Request (param, query, body) Swagger tự đọc từ schema zod trên decorator, không phải khai thêm. Chỉ khai 3 thứ:

```ts
@Post()
@ApiOperation({ summary: 'Lưu một địa điểm (tối đa 20 / user)' })         // một câu, người đọc là dev mobile
@ApiCreatedResponse({ standardSchema: envelope(LocationResponseSchema) })  // envelope() bọc { data, meta }
create(...) {}

@Get()
@ApiOkResponse({ standardSchema: envelope(z.array(LocationResponseSchema)) })
list(...) {}
```

Để schema hiện trong mục **Schemas** (và mobile codegen sinh đúng tên type), đặt `.meta({ id: 'Location' })` ở cuối schema body/response trong file dto. **Không** đặt `meta` cho query schema: query phải inline thì Swagger mới tách được thành từng tham số `?lat=&lng=`. `operationId` tự sinh dạng `Location.list` (tên class bỏ `Controller` + tên hàm) nên không trùng giữa module.

- 401/403/422/429/500 đã khai toàn cục trong `config/openapi.ts` với schema `ErrorResponse`, không lặp lại.
- **Servers**: `/` (máy đang mở trang) và `http://localhost:PORT`; deploy đặt `PUBLIC_URL` trong env để có thêm server public. **Select a definition** ở góc trên chuyển giữa App và Admin.
- Tài liệu chia theo module nghiệp vụ (`OPENAPI_DOCS` trong `app.module.ts`): mỗi mục một định nghĩa trong dropdown, JSON `/docs/<key>-json`, file `openapi/<key>.json`. Không chia app/admin.
- **Quyền và public tự ghi vào mô tả** từ `@RequirePermissions` / `@Public()`: "Quyền cần có: `role:manage`" hoặc "Không cần đăng nhập" (bỏ ổ khoá). Không viết tay các câu này.
- `@ApiOperation({ summary, description })`: `summary` một câu ngắn, `description` giải thích hành vi (trả gì khi rỗng, side effect, giới hạn) như ví dụ "Trả null nếu user chưa tham gia".
- `npm run openapi:export` → `openapi/app.json`, `openapi/admin.json` cho mobile codegen. CI tự xuất.
- Kiểm nhanh: mở `/docs`, chọn định nghĩa, tìm tag, xem "Example Value" của request và response có đúng ý không.

## 8. Auth và quyền

- Mặc định mọi route cần token (AuthGuard). `@Public()` để mở.
- Quyền: `@RequirePermissions(['role:manage'])` trên method hoặc cả controller. Quyền đọc từ DB qua cache 5 phút, đổi role có hiệu lực ngay.
- Thêm quyền mới: thêm dòng trong `drizzle/0002_seed_rbac.sql` (idempotent) rồi `npm run db:migrate` trên DB mới, hoặc INSERT tay trên DB đang có.
- Không bao giờ đọc role từ JWT. Không bao giờ gửi `SUPABASE_SECRET_KEY` cho client.

## 9. Test rồi mới commit

```bash
npm run lint && npm run typecheck   # 0 lỗi
npm test                            # unit + integration (testcontainers tự dựng PostGIS + Redis, ~15 s)
```

- Luật trong service → `test/unit/<x>.service.spec.ts`, repository thay bằng object cùng interface (xem `location.service.spec.ts`).
- SQL + HTTP → `test/integration/<x>.spec.ts`, token từ `startFakeSupabase()` trong `test/setup/jwks.ts`, gọi bằng supertest (xem `location.spec.ts`).
- Không mock để cho qua. Test biên thật: 299 m vs 301 m, đủ 20 vs 21, cursor đi hết không sót.

## 10. Checklist một API

- [ ] Path danh từ số nhiều, path tĩnh trước `:id`, tên hàm = `list|get|create|update|remove|<hành động>`
- [ ] Schema zod trên `@Param/@Query/@Body`, số giới hạn ở constants, query dùng `coerce`
- [ ] Service ném `AppException` với mã trong `ErrorCodes`; của người khác → `NOT_FOUND`
- [ ] Response map ở một hàm; list dùng `pageOf`; 204 cho xoá
- [ ] `@ApiTags` · `@ApiOperation({ summary })` · `@ApiOkResponse/@ApiCreatedResponse({ standardSchema: envelope(...) })` · schema body/response có `.meta({ id })``
- [ ] Module trong `app.module.ts` imports và một mục `OPENAPI_DOCS`
- [ ] Unit + integration test, `npm test` xanh, mở `/docs` xem lại
