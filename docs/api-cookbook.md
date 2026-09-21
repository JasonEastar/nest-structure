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

Trong Swagger bấm **Authorize**, dán token → gọi thử mọi API. Tài khoản dev-token có role `user`; muốn gọi API admin: `node scripts/grant-role.mjs dev@c9map.test admin` (lần đầu, chưa ai có `role:assign`), sau đó gán qua `PUT /api/v1/admin/users/:id/roles`.

## 2. Đặt tên API

| Quy tắc | Đúng | Sai |
|---|---|---|
| Danh từ số nhiều, kebab-case, không động từ trong path | `GET /api/v1/locations` · `/saved-places` | `/getLocations` · `/location` |
| Chi tiết theo id | `GET /locations/:id` | `/locations/detail?id=` |
| Tài nguyên con | `GET /locations/:id/photos` | `/location-photos?locationId=` |
| Truy vấn đặc biệt = path tĩnh, khai **trước** `:id` | `GET /locations/mine-count` | `/locations/:id` khai trước → `mine-count` bị hiểu là id |
| API công khai (không đăng nhập) | `GET /public/locations/nearby`: class thứ hai `<X>PublicController` trong cùng `<x>.controller.ts`, `@Public()` ở class, không `@ApiBearerAuth`, chỉ trả trường an toàn | `@Public()` rải trên từng route của controller thường |
| Hành động không phải CRUD (hiếm) | `POST /pins/:id/vote` · `POST /pins/:id/report` | `PUT /pins/:id?action=vote` |
| API quản trị | `/admin/...`: class thứ hai `<X>AdminController` trong cùng `<x>.controller.ts`, `@RequirePermission(...)` ở class. Swagger tự ghi "Quyền cần có" | tự viết "cần quyền X" vào mô tả (sẽ lệch với guard) |
| Version | tự động `/api/v1/...` (`app.ts`), controller không ghi `v1` | `@Controller('v1/locations')` |

`operationId` = `<Controller bỏ hậu tố>.<tên hàm>` (`Location.list`, `User.me`) — mobile codegen dùng tên này. Đặt tên hàm: `list`, `get`, `create`, `update`, `remove`, hoặc tên hành động. Tên method HTTP: `GET` đọc · `POST` tạo hoặc hành động · `PUT` thay toàn bộ · `PATCH` sửa một phần · `DELETE` xoá.

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
| Header | `@Headers('x-foo') foo?: string` | Chỉ khi thật cần; ưu tiên body/query có schema |
| Route công khai | `@Public()` ở class `<X>PublicController` (cùng file `<x>.controller.ts`), path `public/<resource>` | Không có `req.user`; dữ liệu trả về phải là thứ ai cũng được xem; rate limit vẫn áp theo thiết bị/IP |
| Cần quyền | `@RequirePermission('pin:create')` — nhiều quyền: `@RequirePermission('a', 'b')` | Mã phải có trong `common/auth/permissions.ts` + migration INSERT (test `permissions.spec` kiểm khớp). Luật phụ thuộc dữ liệu → `hasPermission(perms, 'role:assign')` trong service |

## 5. Validate bằng zod (file dto)

```ts
// dto/create-location.dto.ts — một file cho một use case, có cả request lẫn response
export const CreateLocationSchema = z.object({
  name: zText(LOCATION_LIMITS.nameMaxLength),   // trim, bỏ thẻ HTML, 1..60 ký tự
  ...zLatLng.shape,                              // lat -90..90, lng -180..180
  radiusMeters: z.number().int().min(100).max(5_000).default(500),
  isPublic: z.boolean().default(false),
}).meta({ id: 'CreateLocation' });               // id → hiện ở mục Schemas
export type CreateLocation = z.infer<typeof CreateLocationSchema>;

// dto/location.dto.ts
export const LocationResponseSchema = z.object({
  id: z.uuid(), name: z.string(), lat: z.number(), lng: z.number(),
  radiusMeters: z.number().int(), isPublic: z.boolean(), createdAt: z.iso.datetime(),
}).meta({ id: 'Location' });
export const ListLocationsQuerySchema = PaginationQuerySchema;                 // ?cursor=&limit=
export const NearbyLocationsQuerySchema = z.object({                          // GET /public/locations/nearby
  lat: z.coerce.number().min(-90).max(90),                                     // query là string → coerce
  lng: z.coerce.number().min(-180).max(180),
  radiusMeters: z.coerce.number().int().min(1).max(20_000).default(1_000),
});
```

Sai → **422**, danh sách field hỏng nằm ở `meta.issues` (xem mục 6).

`msg` dịch theo ngôn ngữ request; `meta.issues[].message` là câu kỹ thuật của zod (tiếng Anh) để dev debug, không hiển thị cho người dùng. Số giới hạn để trong `<x>.constants.ts`, không viết số trong schema. Helper có sẵn: `zText(max, min?)`, `zLatLng`, `PaginationQuerySchema`. Cần enum: `z.enum(['traffic_jam', 'flooding'])`. Cần field tuỳ chọn: `.optional()` (không gửi) khác `.nullable()` (gửi `null`).

## 6. Trả response và ném lỗi

Controller `return` dữ liệu thuần, interceptor bọc thành response chuẩn. **Mọi response, thành công hay lỗi, đều đúng 5 field.**

```json
// thành công
{ "success": true, "code": "OK", "msg": "",
  "data": { "id": "…", "name": "Nhà", "lat": 10.7798, "lng": 106.699 },
  "meta": { "requestId": "01a0…", "nextCursor": null } }

// lỗi
{ "success": false, "code": "VALIDATION_FAILED", "msg": "Dữ liệu gửi lên không hợp lệ", "data": null,
  "meta": { "issues": [{ "path": "lat", "message": "Too big: expected number to be <=90" }], "requestId": "01a0…" } }
```

| Field | Thành công | Lỗi |
|---|---|---|
| `success` | `true` | `false` |
| `code` | `"OK"` | mã lỗi: `VALIDATION_FAILED`, `NOT_FOUND`… client rẽ nhánh theo đây |
| `msg` | `""` | câu đã dịch theo `Accept-Language`, hiện thẳng cho người dùng |
| `data` | dữ liệu | `null` |
| `meta` | luôn có `requestId`; list thêm `nextCursor` | `requestId` + chi tiết lỗi (`issues`, `reason`, `max`, `retryAfter`…) |

| Tình huống | Viết | Kết quả |
|---|---|---|
| Tạo | `@Post()` return object | 201 + response chuẩn |
| Đọc | `@Get()` return object | 200 |
| Xoá / không có gì trả | `@HttpCode(HttpStatus.NO_CONTENT)` + `Promise<void>` | 204 |
| Danh sách phân trang | service: `return pageOf(rows, query.limit, (r) => ({ createdAt: r.createdAt, id: r.id }))` sau khi repository lấy `limit + 1` dòng | `meta.nextCursor`; client gửi lại `?cursor=` |
| Lỗi nghiệp vụ | `throw new AppException('NOT_FOUND', { resource: 'location', id })` | `success=false`, `code`, `msg` dịch từ `i18n/<lang>/errors.json`, params vào `meta`, đúng HTTP status |
| Sửa một phần (PATCH) | zod `.partial()` + `.refine(body => Object.keys(body).length > 0)`; field nullable → `null` nghĩa là xoá (xem `user/dto/update-me.dto.ts`) | 200 + object sau khi sửa |
| Khoá user (chặn mọi request) | `PATCH /admin/users/:id/status { status: 'blocked' }` → `profiles.status` + ghi đè cache `c9:v1:profile:{id}`; guard đọc cache nên chặn ngay trên mọi instance, không đợi TTL | 403 `FORBIDDEN` reason `ACCOUNT_BLOCKED` |
| Enum mới cho client | thêm mảng `as const` ở `<x>.constants.ts` (zod `z.enum` dùng cùng mảng), đăng ký vào `SYSTEM_ENUMS` (`app-config.constants.ts`), nhãn vào `i18n/{vi,en}/enums.json` theo `<resource>.<field>.<code>` | `GET /public/configs?names=system_enums` trả `{ sort, color, label: { vi, en } }` |
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
- **Servers**: `/` (máy đang mở trang) và `http://localhost:PORT`; deploy đặt `PUBLIC_URL` trong env để có thêm server public. **Select a definition** ở góc trên chuyển giữa các module.
- Tài liệu chia theo module nghiệp vụ (`OPENAPI_DOCS` trong `app.module.ts`): mỗi mục một định nghĩa trong dropdown, JSON `/docs/<key>-json`, file `openapi/<key>.json`. Không chia app/admin.
- **Quyền và public tự ghi vào mô tả** từ `@RequirePermission` / `@Public()`: "Quyền cần có: `role:assign`" hoặc "Không cần đăng nhập" (bỏ ổ khoá). Không viết tay các câu này.
- `@ApiOperation({ summary, description })`: `summary` một câu ngắn, `description` giải thích hành vi (trả gì khi rỗng, side effect, giới hạn) như ví dụ "Trả null nếu user chưa tham gia".
- `npm run openapi:export` → `openapi/users.json`, `openapi/locations.json`, `openapi/health.json` cho mobile codegen. CI tự xuất.
- Kiểm nhanh: mở `/docs`, chọn định nghĩa, tìm tag, xem "Example Value" của request và response có đúng ý không.

## 8. Auth và quyền

- Mặc định mọi route cần token (AuthGuard). `@Public()` để mở.
- Quyền: `@RequirePermission('role:assign')` trên method hoặc cả controller. Quyền đọc từ DB qua cache 5 phút, đổi role có hiệu lực ngay.
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
- [ ] Response map ở một hàm; list dùng `pageOf`; 204 cho xoá (204 không có body)
- [ ] `@ApiTags` · `@ApiOperation({ summary })` · `@ApiOkResponse/@ApiCreatedResponse({ standardSchema: envelope(...) })` · schema body/response có `.meta({ id })``
- [ ] Module trong `app.module.ts` imports và một mục `OPENAPI_DOCS`
- [ ] Unit + integration test, `npm test` xanh, mở `/docs` xem lại

## 11. Log

Dùng `Logger` của Nest, mọi dòng đi qua pino. Dev in một dòng dễ đọc, production in JSON một dòng (Docker/CloudWatch/Loki đọc được).

```ts
private readonly logger = new Logger(PinService.name);   // context = tên class
this.logger.log(`pin created id=${id}`);                 // info
this.logger.warn(`duplicate within 300 m user=${userId}`);
this.logger.error(`fcm failed`, err.stack);              // stack ở tham số 2
```

- Mỗi request tự có một dòng `request completed` với `req.id` (= header `X-Request-Id`), `userId`, `instance`, `statusCode`, `responseTime`. Không cần tự log "request đến".
- Lỗi 5xx: filter tự log stack kèm `requestId`. Client nhận `requestId` trong body lỗi, gửi lại là tra được.
- Không log token, cookie, mật khẩu, SĐT, toạ độ chính xác của user: pino đã redact các key này thành `[redacted]`, nhưng đừng ghép chúng vào chuỗi message.
- Mức log theo `NODE_ENV`: development `debug` · test `warn` · production `info` (logger.ts, không có env riêng). `/health/*` không log.

Xem log: dev `npm run dev` in thẳng terminal (pino-pretty).

**Sentry** (đặt `SENTRY_DSN` trong env, `src/instrument.ts`): lỗi 5xx lên Sentry Issues kèm stack, request và tag `requestId` (filter tự gọi `captureException`); mọi dòng pino từ `info` lên Sentry Logs (tìm theo `requestId`, `userId`); trace: dev 100 % request, prod 10 %. App phải chạy bằng `node --import ./dist/instrument.js dist/main.js` (scripts `dev`, `start:prod` đã đặt) — chạy `node dist/main.js` trần thì Sentry không bắt log/trace. Local để `SENTRY_DSN` trống là tắt.
