# c9_map — backend

**Cập nhật:** 2026-09-16 · **Trạng thái:** Bước 2/11 — skeleton + Docker đa instance chạy được

C9 Map là bản đồ đời sống thời gian thực cho TP.HCM: kẹt xe, ngập, chợ đêm, sự kiện, danh lam… hiện thành pin có tuổi thọ, do người xung quanh xác nhận, tự hết hạn. Repo này là **API backend**; app mobile (Flutter hoặc React Native) là repo riêng, chỉ tiêu thụ OpenAPI.

## Stack (đã chốt)

NestJS 12 modular monolith all-in-one (một project, scale bằng instance — ADR-0006) · Supabase Auth (chỉ auth, Google) + PostgreSQL 16/PostGIS riêng · Drizzle · Redis 7 (cache, rate limit, BullMQ) · zod 4 qua `StandardSchemaValidationPipe` có sẵn · Swagger/OpenAPI (`@nestjs/swagger`) · `nestjs-i18n` · Cloudflare R2 · FCM/APNs · polling thay realtime.
Chi tiết và lý do: [docs/system-architecture.md](./docs/system-architecture.md).

## Tài liệu — đọc theo thứ tự

| # | File | Nội dung |
|---|---|---|
| 1 | [docs/project-overview-pdr.md](./docs/project-overview-pdr.md) | Sản phẩm: vòng lặp, loại pin, state machine, uy tín, phạm vi MVP, pháp lý |
| 2 | [docs/system-architecture.md](./docs/system-architecture.md) | Quyết định công nghệ + cấu hình từng tầng (Supabase, Drizzle, Redis, BullMQ, Swagger, i18n) |
| 3 | [docs/code-standards.md](./docs/code-standards.md) | Nguyên tắc bất biến (MUST/NEVER), cấu trúc thư mục, đặt tên, quy chuẩn tài liệu |
| 3b | [docs/nestjs-guide.md](./docs/nestjs-guide.md) | Toàn bộ docs.nestjs.com chắt lọc: dùng gì / tránh gì / vì sao, gotchas |
| 3c | [docs/setup-strategy.md](./docs/setup-strategy.md) | Cấu hình dự án thế nào, vì sao, làm gì trước |
| 3d | [docs/project-structure-and-flows.md](./docs/project-structure-and-flows.md) | Cây file đầy đủ + lý do từng config + 6 sơ đồ luồng (bootstrap, request, auth, job, module, hạ tầng) |
| 4 | [docs/project-roadmap.md](./docs/project-roadmap.md) | Thứ tự dựng bước 0–11, giai đoạn sản phẩm, những gì không làm |
| 5 | [docs/testing-and-ci.md](./docs/testing-and-ci.md) | Tầng kiểm thử, kịch bản lõi, môi trường, pipeline |
| 6 | [docs/project-analysis.md](./docs/project-analysis.md) | Phân tích PM / QA / Tech Lead, mâu thuẫn đã giải quyết, rủi ro |
| 7 | [docs/decisions-pending.md](./docs/decisions-pending.md) | Quyết định chưa chốt, khuyến nghị tạm |
| 8 | [docs/adr/](./docs/adr/) | Architecture Decision Records |
| 9 | [docs/codebase-summary.md](./docs/codebase-summary.md) | Hiện trạng repo (cập nhật sau mỗi bước) |
| — | [plans/](./plans/) | Kế hoạch triển khai từng bước + báo cáo research |
| — | [demo-html/](./demo-html/) | Prototype 30 màn hình (tên cũ MapChat Live) + overview gốc |
| — | [docs/archive/](./docs/archive/) | Brief gốc trước khi chuẩn hoá |

Quy chuẩn viết tài liệu: [code-standards.md §6](./docs/code-standards.md#6-quy-chuẩn-tài-liệu).

## Bắt đầu nhanh (sau khi có code — bước 1–2)

```bash
# yêu cầu: Node 22+, Docker, một Supabase project (free) đã bật Google provider
cp .env.example .env
npm install
npm run dev:infra        # postgres (postgis) + redis; trùng port? đặt PG_HOST_PORT/REDIS_HOST_PORT trong .env
npm run dev:infra:full   # + api-1, api-2, nginx :3000 — test đa instance
npx nest start --watch       # chạy 1 instance ngoài docker khi debug
curl -i localhost:3000/health/live   # gọi 10 lần → thấy 2 X-Instance-Id
open http://localhost:3000/docs/app  # Swagger UI
```

## Quy tắc làm việc với Claude Code

- Đọc `CLAUDE.md` → `docs/code-standards.md` trước mọi tác vụ.
- Làm **từng bước** theo `docs/project-roadmap.md`, dừng review sau mỗi bước. Không thêm dependency, xoá file, sửa schema mà không hỏi.
- Quyết định sản phẩm chưa chốt → dùng khuyến nghị tạm trong `docs/decisions-pending.md`, ghi ADR khi chốt.
