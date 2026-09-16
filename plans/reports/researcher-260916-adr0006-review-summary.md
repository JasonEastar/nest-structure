# Tổng hợp đánh giá ADR-0006 (all-in-one, cấu trúc đơn giản)

**Ngày:** 2026-09-16 · **Loại:** research-only, không sửa docs/plan
**Nguồn:** 3 báo cáo researcher cùng ngày (`researcher-260916-adr0006-folder-structure.md`, `researcher-260916-drizzle-per-module-schema.md`, `researcher-260916-bullmq-all-in-one.md`) + kiểm chứng trực tiếp trên docs chính thức và package đã cài (`@nestjs/bullmq@12.0.0`, `bullmq@6.3.6`, drizzle docs, drizzle-orm source).

## 1. Kết luận

ADR-0006 **khớp với cách các dự án NestJS thật đang tổ chức** (feature module, `common/`, enhancer đăng ký bằng `APP_*` trong `app.module.ts`, hậu tố `.dto/.schema/.constants/.jobs`). Không có lựa chọn nào đi ngược docs chính thức. Có **4 điểm cần bổ sung quy tắc** trước khi code để tránh lỗi đã được ghi nhận trong cộng đồng (mục 3).

## 2. Đối chiếu từng lựa chọn

| Lựa chọn ADR-0006 | Cộng đồng làm gì | Kết luận |
|---|---|---|
| Một project `nest new`, không monorepo/libs | Đa số dự án nhỏ; monorepo chỉ khi nhiều app TS | ✅ Khớp |
| `modules/<x>/` + hậu tố chuẩn | Encore, CatsMiaow, official Cats example đều vậy | ✅ Khớp |
| `APP_GUARD/PIPE/FILTER/INTERCEPTOR` trong `app.module.ts` | Docs khuyến nghị pattern này để test override | ✅ Khớp |
| `common/` phẳng, 1 file/1 việc | Cộng đồng hay tách `core/` (hạ tầng) + `common/` (tiện ích) và lồng thư mục | ⚠️ Chấp nhận được với đội 1–2 người; giữ quy tắc "vượt 200 dòng thì tách thư mục con" |
| Một `@Global() CommonModule` gom DB/Redis/Queue/Supabase/Logger/I18n | Docs: "making everything global is not recommended"; thực tế 1–3 module global | ⚠️ Chấp nhận ở MVP; tách `CoreModule` (không global) khi > ~12 provider |
| `*.schema.ts` cạnh module + glob `src/**/*.schema.ts` | drizzle-kit hỗ trợ glob/array chính thức | ✅ Khớp, nhưng cần quy tắc import (mục 3.1) |
| Processor trong module, chạy mọi instance | BullMQ cho phép; `@Processor(name, { concurrency })` có sẵn | ✅ Khớp |
| `upsertJobScheduler` id cố định từ `onApplicationBootstrap` | API chính thức v6 (`upsertJobScheduler`, `removeJobScheduler`, `getJobSchedulers`), thay `repeat` đã bị xoá | ✅ Khớp |
| `health/` là thư mục cấp cao | Thường nằm trong `common/` | Cosmetic, giữ nguyên |

## 3. Bốn quy tắc nên thêm trước khi code (đề xuất, chưa áp dụng)

1. **`*.schema.ts` chỉ import từ `drizzle-orm` và `*.schema.ts` khác** — không import `common/database.ts`. Thêm barrel `src/common/schema.ts` (`export * from '../modules/*/x.schema'`) để `drizzle(client, { schema })` có kiểu. Lý do: barrel ↔ module ↔ db là vòng import kinh điển.
2. **FK liên module đi một chiều** (`pin.schema.ts` import `profiles` từ `identity.schema.ts`, không ngược lại). **Không dùng `relations()` / `db.query` ở MVP**, chỉ `db.select()` + join. Nếu sau cần, gom toàn bộ `relations()` vào một file `src/common/relations.ts`.
3. **Scheduler options là hằng số trong `pin.constants.ts`**, không tính từ env hay runtime. Lý do: N instance cùng upsert; nếu options khác nhau giữa các instance trong lúc rolling deploy thì "last writer wins".
4. **Migration là bước CI riêng, không bao giờ lúc boot** — không phải sở thích mà bắt buộc: `PgDialect.migrate()` của drizzle-orm chạy trong transaction nhưng **không có advisory lock** (đã đọc source), N instance cùng migrate sẽ đua.

## 4. Khẳng định trong báo cáo researcher đã kiểm chứng là SAI (không dùng)

| Khẳng định | Thực tế đã kiểm |
|---|---|
| "Drizzle dùng `pg_advisory_lock` khi migrate" | Không. `dialect.ts` chỉ `CREATE TABLE IF NOT EXISTS __drizzle_migrations` + transaction |
| "`drizzle-kit generate` tự sinh `CREATE EXTENSION postgis`" | Không. Guide PostGIS: "Drizzle doesn't create extension automatically" → migration custom |
| "`@nestjs/bullmq` v12 hardcode concurrency = 1" | Sai. `Processor(queueName, workerOptions: NestWorkerOptions)` nhận `concurrency`, `limiter`, `lockDuration` |
| "Relations API tốn 50–100 ms startup mỗi relation" | Không có nguồn; bỏ qua |

## 5. Điểm đã xác nhận đúng và hữu ích

- drizzle-kit `schema` nhận glob và mảng (`"./src/**/*.schema.ts"`); `extensionsFilters: ['postgis']` để bỏ qua bảng của PostGIS khi push/pull.
- Drizzle có `geometry('col', { type: 'point', mode: 'xy', srid: 4326 })` built-in + `index().using('gist', col)`; `geography` vẫn phải `customType`. Giữ `geography` (ST_DWithin theo mét không cần cast).
- BullMQ: Redis cho queue phải `noeviction`; `maxRetriesPerRequest: null`; mỗi Worker giữ 1 kết nối blocking → ~3 kết nối/instance/queue; `db: 1` hợp lệ.
- Graceful shutdown: `worker.close()` đợi job đang chạy; `stop_grace_period 60 s` > `lockDuration` mặc định 30 s là đủ.
- Quy mô MVP (vài trăm push/phút, I/O-bound) nằm thoải mái trong một process; tách worker khi p95 API tăng do fan-out.

## 6. Câu hỏi còn mở
1. Ngưỡng cụ thể để tách `CoreModule` khỏi `CommonModule` (đề xuất: khi > 12 provider hoặc file > 200 dòng).
2. Dùng `geometry` built-in + cast `::geography` trong query, hay `customType geography` như hiện tại? (Đề xuất giữ `geography`.)
3. Tiêu chí đo để bật cờ tắt processor trên instance HTTP (đề xuất: p95 viewport > 100 ms trong 5 phút khi queue depth > 1k).
