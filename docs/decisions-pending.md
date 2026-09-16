# Quyết định chưa chốt — C9 Map

**Cập nhật:** 2026-09-16 · **Trạng thái:** Active · **Chủ sở hữu:** Tech Lead
Mỗi dòng: câu hỏi · ảnh hưởng · khuyến nghị tạm · trạng thái. Đã chốt → ghi ADR trong `docs/adr/` và đánh ✅ kèm link.


## A. Từ README §11 (giữ nguyên)

| # | Câu hỏi | Ảnh hưởng | Khuyến nghị tạm | Trạng thái |
|---|---|---|---|---|
| 1 | Follow hay friend? | Schema social | **Không cả hai** — demo không có social | ✅ Không cả hai — [ADR-0003](./adr/0003-bo-social-module-khoi-mvp.md) |
| 2 | Checkin mặc định public hay private? | Schema default | Demo: check-in landmark là **public** (gallery "most liked") → public, ảnh strip EXIF | ☐ |
| 3 | Xác thực chủ shop bằng gì? | Luồng promoted | Không claim. Promoted nhập venue tự do gđ 3, xác minh bằng gọi điện nếu bị report | ☐ |
| 4 | SOS đi đến ai? | Thiết kế SOS, pháp lý | Cộng đồng 500 m + 2 emergency contacts + disclaimer "không phải cấp cứu" | ☐ |
| 5 | Nhắn tin có làm không? | SSE, 6–10 tuần | **Không.** "Ask seller" = reply trong thread | ✅ Không — [ADR-0004](./adr/0004-polling-thay-realtime.md) |

## B. Mới, từ đối chiếu README ↔ demo

| # | Câu hỏi | Ảnh hưởng | Khuyến nghị tạm | Trạng thái |
|---|---|---|---|---|
| 6 | Tên sản phẩm: C9 Maps hay MapChat Live? | Bundle id, bucket, cache prefix, email | Chốt 1 tên trước bước 1 | ✅ `c9_map` — [ADR-0001](./adr/0001-ten-du-an-c9-map.md) |
| 7 | Stack: giữ NestJS + RN Expo (README) hay Flutter + Spring Boot (overview §8)? | Toàn bộ | Giữ README | ✅ NestJS 12 + mobile agnostic (Flutter/RN gọi OpenAPI) — [ADR-0002](./adr/0002-supabase-auth-va-postgres.md) |
| 8 | Bỏ Social module (post/follow/feed) khỏi MVP? | −2 bảng, −1 module, −3 feed | Bỏ | ✅ Bỏ — [ADR-0003](./adr/0003-bo-social-module-khoi-mvp.md) |
| 9 | Bỏ user-created Places + shop claim? | Module billing, bảng claims | Bỏ. Places = landmark admin | ✅ Bỏ — [ADR-0003](./adr/0003-bo-social-module-khoi-mvp.md) |
| 10 | Loại pin trong MVP? | Số schema attrs, template push | 5 user + landmark + outage auto (xem phân tích §2.1) | ☐ |
| 11 | SOS ở gđ nào? | Pháp lý, runbook | Gđ 2, sau khi vòng lặp pin ổn | ☐ |
| 12 | For sale ở gđ nào? | Reservation, scam, badge | Gđ 4 hoặc bỏ | ☐ |
| 13 | Auth anchor: SĐT (README) hay user_id + identities (demo có email/Google/FB/Apple/phone)? | Bảng users, guard | `user_identities`; phone verified chỉ bắt buộc cho đăng pin, SOS, promoted | ✅ Supabase Auth, `user_id` = `auth.users.id`; phone verified theo hành động — [ADR-0002](./adr/0002-supabase-auth-va-postgres.md) |
| 14 | Facebook login có cần không? | Thêm provider, review FB app | — | ✅ Bỏ. MVP chỉ Google (user chốt 2026-09-16); Apple khi lên App Store |
| 15 | Ngôn ngữ: chỉ vi/en hay + ko/ja? | ×2 template push, test i18n | vi + en ở MVP | ☐ |
| 16 | Cổng thanh toán: VNPay / MoMo / SePay / Airwallex? Stripe không hỗ trợ VN | Module promoted | 1 cổng VN có VietQR + MoMo; thẻ quốc tế sau | ☐ |
| 17 | Hoá đơn VAT điện tử: nhà cung cấp nào? | Tích hợp thêm | Chọn khi làm gđ 3 | ☐ |
| 18 | Cảnh báo theo tuyến đi làm (route) có ở MVP? | Lưu linestring, matching | Không. Chỉ My areas (điểm + bán kính) | ☐ |
| 19 | Pin tự động: nguồn nào hợp pháp (EVN, SAWACO, camera, chợ đêm)? | Module ingest, pháp lý | Bắt đầu bằng admin nhập lịch tay; crawler sau khi kiểm tra ToS | ☐ |
| 20 | Công thức rep chính xác? decay? floor/ceiling? rep người xác nhận có trọng số? | `reputation_events`, tier | Viết trong PRD; v1: +4/+2/+3/+5/−9, clamp 0–100, không decay | ☐ |
| 21 | Report brigading: 3 report ẩn pin — có trọng số theo rep người report? | Bảng reports, job | Có: tổng rep-weight ≥ ngưỡng thay vì đếm 3 | ☐ |
| 22 | Reverse geocoding dùng Google (phí) hay Nominatim self-host? | Chi phí, hạ tầng | Google + cache geohash-7 ở gđ 1 | ☐ |
| 23 | Delete account: pin/thread/ảnh xử lý thế nào? | Cascade, PDPD | Ẩn danh hoá pin + thread, xoá ảnh, giữ aggregate | ☐ |
| 24 | Emergency contacts: SMS cho người không dùng app? Consent? | Chi phí SMS, PDPD | Gửi SMS 1 lần/SOS, lưu HMAC + last4, thông báo khi được thêm | ☐ |
| 25 | Seed user (admin nhóm FB) có rep khởi điểm cao? | Onboarding, invite code | Có, rep 60 qua invite code | ☐ |

## C. Mới, từ quyết định 2026-09-16 (Supabase)

| # | Câu hỏi | Ảnh hưởng | Khuyến nghị tạm | Trạng thái |
|---|---|---|---|---|
| 26 | Supabase Postgres làm DB chính hay chỉ dùng Auth + RDS riêng? | Hạ tầng, backup, chi phí | — | ✅ **Postgres riêng** làm DB chính, Supabase chỉ Auth — [ADR-0005](./adr/0005-postgres-rieng-supabase-chi-auth.md) (user chốt 2026-09-16) |
| 27 | SMS provider cho **liên kết SĐT** (SOS, gđ 2): Send SMS hook → eSMS/SpeedSMS hay Twilio? | Chi phí/SMS | Quyết định ở gđ 2; MVP không có SMS | ☐ |
| 28 | SMTP cho email OTP: Resend / SES / khác? | Deliverability | — | ✅ Không cần: MVP không email OTP. Xem lại nếu thêm email login |
| 29 | Access token lifetime Supabase (mặc định 1 giờ)? | Thu hồi quyền, tải JWKS | — | ✅ **3600 s** mặc định (user chốt 2026-09-16); thu hồi quyền qua cache permission |
| 30 | Swagger UI hay Scalar cho `/docs`? | DX | — | ✅ Swagger UI chính thức của `@nestjs/swagger`, theo https://docs.nestjs.com/openapi/introduction (user chốt 2026-09-16) |
| 32 | Layout repo: npm workspaces hay Nest CLI monorepo mode? | Build, CLI | — | ~~Nest CLI monorepo mode (`apps/api`, `libs/contracts`)~~ → **thay bởi ADR-0006** (2026-09-16): một project `nest new`, không monorepo, không APP_ROLE, DTO/schema cạnh module |
| 33 | Validation: `nestjs-zod` hay pipe có sẵn? | Dependency | — | ✅ `StandardSchemaValidationPipe` có sẵn Nest 12 + `@Body({schema})`; Swagger tự đọc zod |
| 34 | Express hay Fastify? | Platform | — | ✅ Express (nginx nén; xem lại > 5k rps) |
| 35 | `APP_ROLE=admin` tách container ngay? | Compose, main.ts | — | ✅ Không có `APP_ROLE` nữa, all-in-one scale bằng instance — [ADR-0006](./adr/0006-all-in-one-cau-truc-don-gian.md) (user chốt 2026-09-16) |
| 31 | Codegen client cho mobile: `openapi-generator` (Dart) và/hoặc `orval`/`openapi-ts` (TS)? | CI | Xuất `openapi.json` trong CI; mobile repo tự chọn tool | ☐ |
