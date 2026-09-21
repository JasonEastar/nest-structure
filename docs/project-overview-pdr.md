# C9 Map — Tổng quan sản phẩm & yêu cầu (PDR)

**Cập nhật:** 2026-09-16 · **Trạng thái:** Active · **Chủ sở hữu:** Tech Lead
Nguồn sự thật về **sản phẩm**: cái gì, cho ai, quy tắc nghiệp vụ. Kỹ thuật xem [system-architecture.md](./system-architecture.md).

---

## 1. Dự án là gì

**Một câu:** Bản đồ đời sống thời gian thực cho TP.HCM. Kẹt xe, ngập, chợ đêm, cắt điện, sự kiện, đồ cũ cần bán, cảnh đẹp hiện thành pin trên bản đồ, do người xung quanh xác nhận, tự hết hạn. *(Tên cũ trong prototype: MapChat Live.)*

**Khác gì nhóm Facebook / Zalo giao thông:** tin có vị trí, có tuổi thọ, có xác nhận đám đông, chỉ đẩy thông báo cho khu vực bạn quan tâm. Tin không trôi, không spam.

## 2. Đội & giai đoạn

| Mục | Giá trị |
|---|---|
| Đội | 1–2 người, mạnh TypeScript |
| Giai đoạn | Chưa có người dùng, chưa có code backend |
| Ưu tiên | MVP nhanh, kiến trúc mở rộng được, không xây trước thứ chưa cần |
| Thành phố | TP.HCM. Hà Nội / Đà Nẵng "coming soon" (schema có `city_code` từ đầu) |
| Mobile | Flutter hoặc React Native, gọi API qua `openapi.json` — backend không phụ thuộc |

## 3. Vòng lặp cốt lõi

1. Mở app → thấy bản đồ quanh mình với các pin đang sống.
2. Mỗi pin có vòng thời gian cạn dần theo tuổi thọ mặc định của loại.
3. Đi ngang qua → bấm **Still there ✓** hoặc **Gone ✗** (1 chạm).
4. Pin tăng độ tin cậy hoặc tự tắt (3 "Gone" đóng sớm).
5. Nhận push khi có pin mới trong My areas.

## 4. Ba lớp dữ liệu

| Lớp | Ví dụ | Vòng đời | Cache | Riêng tư |
|---|---|---|---|---|
| **Live** | Kẹt xe, ngập, chợ đêm, SOS, promoted | Phút–giờ, tự hết hạn | 10s viewport | Ẩn danh tác giả với người khác |
| **Landmark (Places)** | Nhà thờ Đức Bà, 12 landmark/thành phố | Vĩnh viễn, admin tạo | 30 phút | Công khai |
| **Engagement** | Vote, thread reply, like, report, check-in, rep, badge | Vĩnh viễn, gắn user | Đếm qua Redis, dựng từ PG | Tên hiện trong thread & profile |

Không có lớp "Social" (post, follow, feed). Lý do: [project-analysis.md §1](./project-analysis.md).

## 5. Loại pin

| `type` | Màu | Tuổi thọ mặc định | Nguồn | Giai đoạn |
|---|---|---|---|---|
| `traffic_jam` | đỏ | 30 phút | user, camera giao thông | MVP |
| `flooding` | xanh dương | 3 giờ | user | MVP |
| `night_market` | vàng | 4 giờ (tự theo lịch mở cửa) | user, lịch admin | MVP |
| `event` | tím | 3 giờ | user | MVP |
| `street_food` | cam | 3 giờ | user | MVP |
| `outage` | xám | 4 giờ | tự động (lịch EVN / SAWACO, admin nhập tay trước) | MVP |
| `landmark` | đỏ hồng ★ | không hết hạn | admin | MVP |
| `scenic` | xanh ngọc | 1,5 giờ | user | 2 |
| `fishing` | xanh biển | 3 giờ | user | 2 |
| `sos` | đỏ đậm | tới khi báo an toàn | user (phone verified) | 2 |
| `promoted` | hồng | theo giờ đã mua | venue trả tiền | 3 |
| `for_sale` | chàm | 6–72 giờ | user | 4 |

Người dùng chọn tuổi thọ trong tập cho phép: pin thường `30 / 60 / 180 / 360` phút; for_sale `360 / 1440 / 2880 / 4320` phút. Pin tự động có badge ⚙ và nguồn "automatic".

## 6. Hành động chung trên mọi pin

| Hành động | Quy tắc |
|---|---|
| **♥ Like** | Đếm, bật/tắt. Không ảnh hưởng rep hay trust. |
| **Still there / Gone** | 1 vote/user/pin. Chủ pin không được vote pin mình. Không áp dụng cho `landmark`, `promoted`. |
| **Directions** | Mở chỉ đường tới toạ độ pin. |
| **Share** | Copy deep link. |
| **Report** | Lý do: Not true · Already gone · Wrong place · Spam or ad · Offensive · Unsafe/scam. Ngưỡng ẩn tính theo trọng số rep người report (không đếm đơn thuần 3). Report sai trừ rep người report. |
| **Thread** | Reply, reply-to. Hiện display name + nhãn ★ CITY KEEPER / VENUE. |
| **Dòng nguồn** | "12 min ago" / "automatic" / "permanent". Không hiện tác giả pin Live. |

## 7. Trạng thái pin (state machine)

| Từ | Đến | Điều kiện | Ai/cái gì |
|---|---|---|---|
| — | `pending` | Tạo pin, rep < 40, không ảnh | user |
| — | `live` | Tạo pin, rep ≥ 40 hoặc có ảnh (ảnh = 1 xác nhận); pin admin/auto/promoted | user / admin / job |
| `pending` | `live` | ≥ 1 xác nhận "Still there" | vote |
| `pending` | `hidden` | Không ai xác nhận khi đã qua nửa tuổi thọ | job `marker-maintenance` |
| `live` / `pending` | `removed` | ≥ 3 "Gone" **hoặc** report vượt ngưỡng | vote / report |
| `live` | `expired` | `now ≥ expires_at` | job mỗi phút |
| `live` | `closed` | Chủ pin đóng sớm; SOS "I'm safe" | user |
| `live` | `sold` | Chủ pin "Mark as sold" (`for_sale`) | user |
| `live` | `live` (gia hạn) | Promoted "Extend hours" sau thanh toán | webhook |

```
MUST   pending: hiện mờ 55% + badge "Pending · 0 ✓" cho người khác; rõ cho chủ pin
MUST   pending: KHÔNG push, KHÔNG vào Alerts, CÓ trong viewport & Nearby
MUST   trước khi tạo: nếu có pin cùng type còn sống trong 300 m → trả DUPLICATE_NEARBY, client hỏi xác nhận thay vì đăng
NEVER  hiển thị author_id của pin Live trong DTO công khai
```

## 8. Uy tín (Reputation)

Thang 0–100, clamp, lưu event-sourced (`reputation_events`), `profiles.rep` là cache. Công thức v1 (không decay):

| Sự kiện | Δ rep |
|---|---|
| Pin của bạn được xác nhận lần đầu | +4 |
| Bạn xác nhận đúng pin người khác | +2 |
| Pin kèm ảnh | +3 |
| Check-in landmark | +5 |
| Pin bị 3 "Gone" / report vượt ngưỡng | −9 |
| Report sai (pin bị report vẫn sống tới hết hạn) | −2 |

| Tier | Rep | Hiệu lực |
|---|---|---|
| Pending | < 40 | Pin mờ, chờ 1 xác nhận. 5 pin/ngày |
| Normal | 40–79 | Hiện rõ, viền đứt "chưa xác nhận". 15 pin/ngày |
| Trusted | 80–99 | Live ngay, ưu tiên push. Không giới hạn ngày |
| Max | 100 | Ưu tiên push cao nhất |

Rate limit tạo pin (mọi tier): 1 pin / 2 phút; 3 pin cùng type / 300 m / giờ. Seed user (admin nhóm FB) nhận rep khởi điểm 60 qua invite code. Streak (ngày liên tiếp có hành động) không ảnh hưởng rep.

## 9. Badges

Vĩnh viễn, không cộng rep, mỗi badge một điều kiện rõ + thanh tiến độ. Đánh giá bất đồng bộ qua job.

| Nhóm | Badge | Điều kiện |
|---|---|---|
| City | City Keeper · {city} | Check-in đủ 12 landmark của thành phố. Nhãn ★ trong thread |
| Place | Eyes on {street} | Nhiều pin kẹt xe được xác nhận nhất trên 1 đường / tháng |
| Season | Flood watcher {year} | Báo/xác nhận 20 pin ngập trong mùa mưa |
| Community | First responder | "I'm coming" 3 SOS, tới trong 10 phút |
| Community | Fair seller | Đóng 10 pin for_sale "sold", không bị báo cáo |
| Milestone | First 100 reports / 500 confirmations | Đếm tích luỹ |
| Milestone | 30-day / 100-day streak | Hoạt động liên tục |
| Milestone | Night owl | 30 pin trong 22:00–5:00 |
| Milestone | Photographer | 100 ảnh trên pin/check-in |
| Milestone | Trusted 100 | Rep 100 giữ 30 ngày |

## 10. My areas & Alerts

- Người dùng tạo tối đa 3 area: tên (Home/Work), tâm + bán kính 500 m – 2 km, lịch (24/7 hoặc khung giờ), bật/tắt từng loại pin.
- Pin chuyển `live` → fan-out tới user có area chứa pin, đúng khung giờ, đúng loại bật, ưu tiên theo tier người đăng.
- Alerts feed: LIVE / EXPIRED, chỉ pin trong areas. Cảnh báo theo **tuyến đi làm**: giai đoạn sau (xem [decisions-pending.md](./decisions-pending.md) #18).

## 11. SOS (giai đoạn 2)

| Mục | Quy tắc |
|---|---|
| Kích hoạt | Giữ 2 giây, chọn loại: Accident · Medical · Harassment · Stranded · Other |
| Yêu cầu | Tài khoản đã xác minh số điện thoại. Rate limit 1 / 5 phút |
| Người nhận | Mọi user trong 500 m có `sos_alerts_enabled` + tối đa 2 emergency contacts (SMS 1 lần) |
| Vị trí live | Client gửi mỗi 10 s, responder poll 5 s, giữ ở Redis TTL 60 s |
| Kết thúc | "I'm safe now" đóng pin, dừng chia sẻ |
| Disclaimer | Màn SOS luôn hiện 113 / 114 / 115 và câu "không thay thế cấp cứu" |
| Vận hành | Kill switch qua feature flag; runbook `docs/runbook-sos.md` (viết ở gđ 2) |

## 12. Promoted & thanh toán (giai đoạn 3)

- Venue nhập tên/địa chỉ, offer, thời lượng, bán kính 500 m / 1 km / 2 km. Giá 25.000 ₫/giờ + VAT 8 %.
- Pin hồng, ghi "Promoted · paid by", có Claim offer → mã tại quầy (1 mã/người, giới hạn số lượng), không có trust/vote.
- Pin bật khi webhook thanh toán xác nhận; hoàn tiền nếu không lên. Hoá đơn điện tử qua nhà cung cấp.
- Cổng thanh toán VN (VNPay / MoMo / SePay VietQR) — chưa chốt, xem [decisions-pending.md](./decisions-pending.md) #16.
- Thống kê cho venue: views, claims. "Hide deals from this venue", "Report this ad".

## 13. For sale (giai đoạn 4)

Giá, tình trạng, điểm gặp; "I'll take it" = reservation tới giờ hẹn + push cho người bán; "Ask seller" = reply trong thread (không có chat riêng). Không thanh toán trong app. Pin đóng khi "sold".

## 14. Phạm vi

| Có trong MVP | Chưa (gđ 2–4) | Bỏ hẳn |
|---|---|---|
| 7 loại pin §5 (MVP) | scenic, fishing, SOS, promoted, for_sale | Post / follow / feed |
| Vote, thread, like, report | Badges đầy đủ (MVP chỉ đếm số) | Shop claim địa điểm |
| Rep + pending | Emergency contacts | Moderator theo vùng |
| My areas + push | Thanh toán, hoá đơn | Chat / nhắn tin |
| Landmark check-in + City Keeper progress | Pin tự động crawl (MVP: admin nhập tay) | Cảnh báo theo tuyến (hoãn) |
| Auth: Google sign-in (Supabase) | Apple sign-in (khi lên App Store), liên kết SĐT cho SOS (gđ 2) | Email/phone OTP đăng nhập, Facebook login, Subscription cho user cuối |
| vi + en | ko, ja | — |
| Admin: xem report, xoá pin, ban user | Bull Board, feature flags UI | — |

## 15. Chỉ số thành công

| Nhóm | Chỉ số |
|---|---|
| Nội dung | Pin mới/ngày, median thời gian tới xác nhận đầu, % pin được xác nhận, % pin Gone/report |
| Retention | D1 / D7, % bật push, % tạo My areas |
| Chất lượng | Tỉ lệ report sai, số tài khoản bị ban |
| SOS (gđ 2) | SOS thật vs giả, thời gian tới "I'm coming" đầu tiên |
| Doanh thu (gđ 3) | Số promoted/tuần, doanh thu/venue |

## 16. Pháp lý & riêng tư

| Chủ đề | Quy tắc |
|---|---|
| PDPD (NĐ 13/2023) | Consent vị trí chính xác tại onboarding; Privacy Policy nêu rõ mục đích, kể cả bán dữ liệu tổng hợp ẩn danh |
| Retention | `user_locations` 30 ngày, SOS location 24 h, notifications 6 tháng, log 14 ngày |
| Delete account | Ẩn danh hoá pin + thread, xoá ảnh, giữ aggregate; cascade qua Supabase admin API |
| Export | Endpoint xuất dữ liệu cá nhân (gđ 2) |
| Emergency contacts | Dữ liệu bên thứ ba: lưu HMAC + 4 số cuối, thông báo khi được thêm |
| Ảnh | Strip EXIF (GPS) trước khi public; lọc NSFW cơ bản |
| Pin tự động | Kiểm tra ToS nguồn trước khi crawl; fallback admin nhập tay |
| Hoá đơn | Hoá đơn điện tử theo NĐ 123/2020 (gđ 3) |
| App Store | Bắt buộc có Report + Block user với UGC |

## 17. 30 màn hình prototype → nhóm chức năng

| Nhóm | Màn hình | Giai đoạn |
|---|---|---|
| Onboarding & Auth | Welcome, 3 intro, Sign in (chỉ nút Google ở MVP), Profile setup, Chọn thành phố. Màn Email/Phone OTP: bỏ | MVP |
| Map & Pin | Home map, Nearby, Pin detail + thread, Create pin, Report | MVP |
| Landmark | Landmark detail, check-in, gallery | MVP |
| Alerts | My areas, Alerts feed | MVP |
| Profile | Profile, Badges, How pins go live, Account, Language | MVP |
| SOS | SOS hold, SOS sent | 2 |
| Business | Business, Checkout, Receipt, Promoted detail | 3 |
| For sale | For sale detail, create for sale | 4 |

Prototype: `demo-html/MapChat Phone.dc.html`, `demo-html/MapChat Live - All screens.dc.html`.

## 18. Tài liệu liên quan

- [system-architecture.md](./system-architecture.md) — kiến trúc, cấu hình từng tech
- [code-standards.md](./code-standards.md) — nguyên tắc bất biến, quy ước
- [project-roadmap.md](./project-roadmap.md) — thứ tự dựng
- [testing.md](./testing.md) — kiểm thử
- [project-analysis.md](./project-analysis.md) — phân tích PM / QA / Tech Lead
- [decisions-pending.md](./decisions-pending.md) — quyết định chưa chốt
