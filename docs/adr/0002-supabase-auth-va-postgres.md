# ADR-0002 — Supabase làm Auth và Postgres chính

**Ngày:** 2026-09-16 · **Trạng thái:** Accepted (mục Postgres **bị thay bởi [ADR-0005](./0005-postgres-rieng-supabase-chi-auth.md)**: DB chính là Postgres riêng, Supabase chỉ Auth)

## Bối cảnh
README gốc tự làm auth (JWT 15 phút, refresh xoay vòng, OTP SMS, bảng `refresh_tokens`). Đội 1–2 người, chưa có người dùng, cần ra MVP nhanh. Người dùng chốt dùng Supabase cho auth, user, permission.

## Quyết định
- **Supabase Auth** phát hành JWT. MVP **chỉ Google sign-in** (bổ sung 2026-09-16); Apple khi lên App Store; phone OTP chỉ để liên kết SĐT cho SOS ở gđ 2. NestJS **chỉ xác thực** token qua JWKS, không phát hành access token, không giữ bảng refresh/OTP.
- **Supabase Postgres (PostGIS bật)** là DB chính, truy cập bằng Drizzle qua connection string; RLS không dùng vì NestJS là client duy nhất (service role).
- Bảng ứng dụng nằm trong schema `public` (`profiles`, `roles`, `permissions`, `user_roles`, `devices`, …). Schema `auth.*` thuộc Supabase, chỉ đọc qua Admin API.
- Redis vẫn tự vận hành (Supabase không có Redis).

## Hệ quả
- Bỏ ~1 tuần làm auth; bỏ `refresh_tokens`, `c9:otp:*`, `c9:revoked:*`.
- Push token gắn với bảng `devices(user_id, device_id)` thay vì refresh token.
- Không cần SMTP/SMS ở MVP. Khi liên kết SĐT (gđ 2): Supabase chỉ có Twilio/Vonage/MessageBird/Textlocal → dùng **Send SMS hook** tới nhà cung cấp VN.
- Phân quyền hoàn toàn ở NestJS (bảng RBAC + cache Redis), không dùng Custom Access Token Hook để nhét role vào JWT → thu hồi quyền tức thì.
- Rủi ro lock-in chấp nhận được: dữ liệu là Postgres chuẩn, auth có thể thay bằng GoTrue self-host.
- Chi tiết cấu hình: [system-architecture.md](../system-architecture.md).
