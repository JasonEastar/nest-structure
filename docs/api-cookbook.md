# C9 Map — Sổ tay viết API

**Cập nhật:** 2026-09-17 · **Trạng thái:** Active · **Chủ sở hữu:** Tech Lead
Cách bắt đầu code, đặt tên API, nhận input, validate, trả response, ném lỗi, hiện lên Swagger. Mọi đoạn code đều lấy từ module mẫu `src/modules/location/`. Đọc [code-walkthrough.md](./code-walkthrough.md) trước nếu chưa biết request đi qua đâu.

---

## 1. Chạy được trong 5 phút

```bash
cp .env.example .env            # điền SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY (Dashboard → API keys)
npm install
npm run dev:infra               # Postgres + PostGIS, Redis (Docker). Port host: PG_HOST_PORT / REDIS_HOST_PORT trong .env
npm run db:migrate              # tạo bảng + seed role/permission
npm run dev                     # http://localhost:3000, sửa file là tự reload
open http://localhost:3000/docs/app          # Swagger cho app · /docs/admin cho quản trị
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
| Truy vấn đặc biệt = path tĩnh, khai **trước** `:id` | `GET /locations/nearby` | `/locations/:id` khai trước → `nearby` bị hiểu là id |
| Hành động không phải CRUD (hiếm) | `POST /pins/:id/vote` · `POST /pins/:id/report` | `PUT /pins/:id?action=vote` |
| API quản trị | `/admin/...` trong module riêng `<x>-admin.controller.ts` + `IdentityAdminModule` kiểu | trộn vào controller app |
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

Thứ tự viết: schema → migrate → dto → repository → service → controller → test. Đăng ký module trong `app.module.ts` (`imports`) và `OPENAPI_DOCS.app` (hoặc `.admin`).

## 4. Nhận input: param, query, body, header, user

```ts
// location.controller.ts
@ApiTags('locations')            // nhóm trong Swagger = tên tài nguyên
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

  @Get('nearby')                                                // path tĩnh khai TRƯỚC ':id'
  nearby(@CurrentUser() user: AuthUser, @Query({ schema: NearbyLocationsQuerySchema }) query: NearbyLocationsQuery) {
    return this.locations.nearby(user.id, query);
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
| Route công khai | `@Public()` trên method hoặc class | Health, docs, webhook đã ký |
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
export const NearbyLocationsQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),                                     // query là string → coerce
  lng: z.coerce.number().min(-180).max(180),
  radiusMeters: z.coerce.number().int().min(1).max(20_000).default(1_000),
});
```

Sai → **422** với body:

```json
{ "error": { "code": "VALIDATION_FAILED", "params": { "issues": [{ "path": "lat", "message": "Too big: expected number to be <=90" }] }, "requestId": "…" } }
```

Số giới hạn để trong `<x>.constants.ts`, không viết số trong schema. Helper có sẵn: `zText(max, min?)`, `zLatLng`, `PaginationQuerySchema`. Cần enum: `z.enum(['traffic_jam', 'flooding'])`. Cần field tuỳ chọn: `.optional()` (không gửi) khác `.nullable()` (gửi `null`).

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
| Lỗi nghiệp vụ | `throw new AppException('NOT_FOUND', { resource: 'location', id })` | `{ error: { code, params, requestId } }` đúng HTTP status |
| Lỗi mới chưa có mã | thêm vào `ErrorCodes` trong `common/http/exceptions.ts` kèm status | Client dịch theo `code`, server không trả câu chữ |

Mã lỗi hiện có: `VALIDATION_FAILED` 422 · `NOT_FOUND` 404 · `UNAUTHENTICATED` 401 · `FORBIDDEN` 403 · `RATE_LIMITED` 429 · `CONFLICT` 409 · `BAD_REQUEST` 400 · `PAYLOAD_TOO_LARGE` 413 · `SERVICE_UNAVAILABLE` 503 · `INTERNAL` 500. Lỗi 5xx bất ngờ (throw Error thường) tự thành `INTERNAL`, stack chỉ ghi log.

Map row DB sang response ở **một hàm** trong service (`toResponse`), controller không tự ghép object. Dữ liệu của người khác trả `NOT_FOUND`, không trả `FORBIDDEN` (không lộ tồn tại).

## 7. Hiện đúng trên Swagger

Request (param, query, body) Swagger tự đọc từ schema zod trên decorator, không phải khai thêm. Chỉ khai 3 thứ:

```ts
@Post()
@ApiOperation({ summary: 'Lưu một địa điểm (tối đa 20 / user)' })      // một câu, người đọc là dev mobile
@ApiCreatedResponse({ schema: zodResponse(LocationResponseSchema, true) })  // true = bọc envelope { data, meta }
create(...) {}

@Get()
@ApiOkResponse({ schema: zodResponse(z.array(LocationResponseSchema), true) })
list(...) {}
```

- 401/403/422/429/500 đã khai toàn cục trong `config/openapi.ts`, không lặp lại.
- API nằm ở `/docs/app` hay `/docs/admin` do `OPENAPI_DOCS` trong `app.module.ts` quyết định theo module. Module admin tách riêng (`IdentityAdminModule`) để không lộ vào docs app.
- `npm run openapi:export` → `openapi/app.json`, `openapi/admin.json` cho mobile codegen. CI tự xuất.
- Kiểm nhanh: mở `/docs/app`, tìm tag, xem "Example Value" của request và response có đúng ý không.

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
- [ ] `@ApiTags` · `@ApiOperation({ summary })` · `@ApiOkResponse/@ApiCreatedResponse({ schema: zodResponse(..., true) })`
- [ ] Module trong `app.module.ts` imports và `OPENAPI_DOCS`
- [ ] Unit + integration test, `npm test` xanh, mở `/docs/app` xem lại
