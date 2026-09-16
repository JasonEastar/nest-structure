# ADR-0005 — Postgres riêng làm DB chính, Supabase chỉ làm Auth

**Ngày:** 2026-09-16 · **Trạng thái:** Accepted (bổ sung cùng ngày: **tự host Postgres ở staging/prod**, không RDS) · **Thay thế một phần:** ADR-0002 (mục "Supabase Postgres là DB chính")

## Bối cảnh
ADR-0002 giả định dùng Supabase Postgres làm DB chính để có một vendor. Người dùng quyết định tách: dữ liệu nghiệp vụ nằm trên PostgreSQL 16 + PostGIS tự vận hành (local: container `postgis/postgis:16-3.4`; staging/prod: **container cùng image trên máy tự quản**, không dùng RDS — người dùng chốt), Supabase chỉ giữ vai trò identity provider (Google sign-in, JWT ES256, JWKS).

## Quyết định
- DB chính: Postgres riêng, **tự host** ở mọi môi trường bằng image `postgis/postgis:16-3.4` (service `postgres` trong compose giữ nguyên cho staging/prod). Kết nối trực tiếp (`postgres` driver, `prepare: true`), không Supavisor.
- **Backup do mình lo** (không có RDS): volume dữ liệu trên EBS; `pg_dump` hàng ngày lên S3 (giữ 14 ngày) ngay từ staging; PITR bằng WAL archiving (WAL-G/pgBackRest) khi có người dùng thật. Ghi runbook restore và **diễn tập restore** trước khi lên prod.
- Supabase: chỉ Auth. Không có schema `auth` trong DB của app → **không trigger sync**. Profile được tạo **phía app** khi request đầu tiên có JWT hợp lệ (`INSERT … ON CONFLICT DO NOTHING` + role `user`), cache flag Redis 1 giờ.
- `profiles.id` = `sub` của Supabase (uuid v4), **không FK** tới `auth.users` (khác database).
- Xoá tài khoản: xoá/ẩn danh hoá local trong transaction rồi gọi `auth.admin.deleteUser`; idempotent.
- Access token: mặc định Supabase **3600 s** (1 giờ). Thu hồi quyền vẫn tức thì nhờ `DEL c9:perms:{userId}` (permission không nằm trong JWT).
- Local dev: docker-compose `postgres` + `redis` + `api×2` + `nginx`; auth dùng **hosted Supabase dev project** (free), không `supabase start` (Google OAuth cần project thật; CLI local kéo ~10 container chỉ để có GoTrue).

## Hệ quả
- Tự lo hoàn toàn: backup, restore, PITR, nâng cấp minor/major, tuning `shared_buffers`/`max_connections`, giám sát disk. Đổi lại: rẻ hơn RDS ~40–60 USD/tháng, toàn quyền extension.
- Hệ quả hạ tầng: staging/prod cần ít nhất một máy có volume bền (EC2 + EBS) → phương án deploy tự nhiên là EC2 + compose/Swarm; ECS Fargate chỉ cho app, không cho Postgres.
- Mất khả năng join `auth.users`; mọi thông tin user cần cho nghiệp vụ phải nằm trong `profiles` (email, display name, avatar lấy từ claims lúc upsert).
- Không phụ thuộc pooler Supabase; PgBouncer khi tổng kết nối > 50.
- Chi tiết cấu hình: [system-architecture.md](../system-architecture.md) §5, §14; chiến lược dựng: [setup-strategy.md](../setup-strategy.md).
