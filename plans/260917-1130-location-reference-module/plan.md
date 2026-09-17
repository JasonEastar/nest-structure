# Plan: Module mẫu `location` — chuẩn tham chiếu cho mọi module nghiệp vụ

**Ngày:** 2026-09-17 · **Trạng thái:** ✅ Hoàn thành 2026-09-17 (66/66 test, migrate 0003, Swagger tag locations) · **Ưu tiên:** Cao (user yêu cầu để hình dung cấu trúc trước bước 7)

## Mục tiêu
- Một module CHẠY THẬT, nhỏ, đủ mọi loại file: module · controller · service · repository · constants · dto/ · schema/ · migration · test.
- Nghiệp vụ: "địa điểm đã lưu" của user (tên + toạ độ + bán kính). Sau này là nền cho "My areas" (roadmap bước 11, decision #18) nên không phải code vứt đi.
- Trả lời 2 câu hỏi cấu trúc: (1) `dto/` có tách `requests/` `responses/` không → KHÔNG, một file `dto/<use-case>.dto.ts` chứa cả request + response của use case đó; (2) dự án lớn thì sao → chia module theo nghiệp vụ, không chia thư mục theo loại (ghi vào code-standards §3).

## Phạm vi
- `common/database/columns.ts`: `timestamps`, `uuidV7Pk`, `geographyPoint` + helper lat/lng (chuyển từ drizzle.ts; schema import được mà không tạo vòng).
- Thêm lại đúng lúc (giờ có consumer): `common/http/pagination.ts` (cursor + `PaginationQuerySchema` + `pageOf`), `withMeta` trong response.ts, `zText`/`zLatLng` trong validation.ts.
- `modules/location/`: bảng `saved_locations` (GIST index), API `POST/GET /locations`, `GET /locations/nearby`, `GET/DELETE /locations/:id`, giới hạn 20/user.
- Test: unit (pagination, validation, service với repository giả có kiểu), integration (JWKS giả dùng chung `test/setup/jwks.ts`, PostGIS thật: cursor, nearby 299 m vs 301 m, cách ly user, giới hạn 20).
- Docs: code-walkthrough §6 trỏ vào module này; code-standards §3 quy tắc dto + khi dự án lớn; codebase-summary.

## Done khi
`npm run lint && npm run typecheck && npm test && npm run build && npm run openapi:export` xanh; `/docs/app` hiện tag `locations`.
