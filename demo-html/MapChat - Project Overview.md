# MapChat Live — Tổng quan dự án (prototype của C9 Map)

> Tên dự án chính thức: **c9_map** ([ADR-0001](../docs/adr/0001-ten-du-an-c9-map.md)). Tài liệu sản phẩm đã hợp nhất: [`docs/project-overview-pdr.md`](../docs/project-overview-pdr.md).

**Một câu:** Bản đồ đời sống thời gian thực cho TP.HCM. Kẹt xe, ngập, chợ đêm, cắt điện, sự kiện, đồ cũ cần bán, cảnh đẹp — hiện thành pin trên bản đồ, do người xung quanh xác nhận, tự hết hạn.

**Khác gì nhóm Facebook / Zalo giao thông:** tin có vị trí, có tuổi thọ, có xác nhận đám đông, và chỉ đẩy thông báo cho khu vực / tuyến đường bạn quan tâm. Tin không trôi, không spam.

---

## 1. Vòng lặp cốt lõi

1. Mở app → thấy bản đồ quanh mình với các pin đang sống.
2. Mỗi pin có **vòng thời gian** cạn dần (kẹt xe 30 phút, ngập 3 giờ, chợ đêm tới 23h…).
3. Đi ngang qua → bấm **Still there ✓** hoặc **Gone ✗** (1 chạm).
4. Pin tăng độ tin cậy hoặc tự tắt (3 người báo "Gone" là đóng sớm).
5. Nhận push khi có pin mới trên tuyến đi làm / quanh nhà.

## 2. Loại pin

| Loại | Màu | Tuổi thọ mặc định | Ghi chú |
|---|---|---|---|
| Traffic jam | đỏ | 30 phút | nguồn user + camera giao thông |
| Flooding | xanh dương | 3 giờ | |
| Night market | vàng | 4 giờ | tự động theo lịch mở cửa |
| Event | tím | 3 giờ | |
| Power / water outage | xám | 4 giờ | tự động từ lịch EVN / SAWACO (badge ⚙) |
| Street food | cam | 3 giờ | |
| Scenic moment | xanh ngọc | 1,5 giờ | hoàng hôn, sương, ánh đèn |
| Fishing spot | xanh biển | 3 giờ | |
| For sale | chàm | 6–72 giờ | đồ cũ, gặp trực tiếp, không thanh toán qua app |
| Deal (Promoted) | hồng | theo giờ đã mua | quán trả tiền, không có trust / confirm |
| SOS | đỏ đậm | tới khi báo an toàn | giữ 2 giây, chia sẻ vị trí live |
| Landmark | đỏ hồng ★ | **không hết hạn** | danh lam do MapChat quản lý, có ♥ và check-in |

## 2b. Hành động chung trên mọi pin

Mỗi sheet chi tiết pin, bất kể loại, có cùng một hàng hành động: **♥ Like** (đếm, bật/tắt), **Directions** (mở chỉ đường tới vị trí pin), **Share** (copy link), **Report** (Not true · Already gone · Wrong place · Spam or ad · Offensive · Unsafe/scam; 3 báo cáo ẩn pin, báo cáo sai trừ rep người đăng). Dòng nguồn ghi rõ ai đăng và **thời gian** (12 min ago / automatic / permanent). Like không ảnh hưởng rep hay độ tin cậy; nó chỉ là tín hiệu "đáng chú ý" và hiện trên marker.

## 2c. Pin mới: trạng thái Pending

Pin của người **rep < 40** (không kèm ảnh) hiện **mờ 55%**, vòng thời gian màu xám, badge "Pending · 0 ✓" cho mọi người đến khi có 1 xác nhận. Trong thời gian đó: vẫn hiện trên bản đồ và Nearby (để người đi ngang xác nhận), **không** push, không vào Alerts. Với chính người đăng pin luôn rõ, kèm dải vàng "Only you see this clearly · seen by N nearby"; My pins ghi "Pending" màu vàng. Rep 40–79: hiện rõ ngay, viền đứt "chưa xác nhận". Rep 80+: live ngay. Ảnh tính như 1 xác nhận. Kết thúc: 1 xác nhận → live, +4 rep; không ai xác nhận đến nửa tuổi thọ → ẩn, không phạt; 3 "Gone" hoặc 3 report → xóa, −9 rep. Giới hạn ngày: 5 / 15 / không giới hạn (rate limit 1 pin/2 phút, 3 cùng loại/300 m/giờ). Màn "How pins go live" trong Profile giải thích toàn bộ.

## 3. Hồ sơ người dùng (Profile) — ý nghĩa từng con số

### Không có vai trò "trưởng khu"
Mọi người dùng bình đẳng. Quyền lợi đến từ **điểm uy tín**, danh hiệu đến từ **badge**. Không có ai được trao quyền ghim / đóng pin của người khác; hệ thống xác nhận đám đông làm việc đó.

### REP 92 — Điểm uy tín (Reputation)
Thang 0–100. Công thức gợi ý: tỉ lệ tin bạn đăng được người khác xác nhận đúng, có trọng số theo thời gian gần đây.

Ảnh hưởng:
- **Dưới 40:** pin của bạn hiện mờ / chờ 1 người xác nhận mới hiện rõ.
- **40–79:** hiện bình thường.
- **80+:** pin hiện ngay, được ưu tiên đẩy thông báo cho người khác.
- **100:** tối đa, pin được ưu tiên cao nhất khi đẩy thông báo.

Cách tăng: đăng tin được xác nhận (+4), xác nhận tin của người khác đúng (+2), kèm ảnh (+3), check-in landmark (+5). Cách giảm: tin bị 3 người báo "Gone" ngay sau khi đăng (−9), bị báo spam.

### 128 reports
Số pin bạn đã đăng (cả còn sống và đã hết hạn). Đây là **đóng góp**. Không tính landmark (do MapChat tạo) và SOS.

### 940 confirmations
Số lần bạn bấm **Still there / Gone** cho pin của người khác. Đây là **hành vi giữ bản đồ sạch**, và là nguồn rep dễ nhất cho người mới. Người không bao giờ đăng tin nhưng xác nhận nhiều vẫn có rep cao.

### 41 day streak
Số ngày liên tiếp bạn có ít nhất một hành động (đăng, xác nhận, check-in). Mục đích: giữ retention. Streak không ảnh hưởng rep, chỉ mở badge và hiển thị trên profile.

## 4. Your impact this week — tác động cá nhân tuần này

Bảng này ai cũng có, chỉ tính pin **của bạn** trong quận bạn hoạt động nhiều nhất:
- **14 pins posted:** số pin bạn đăng tuần này.
- **91% confirmed:** tỉ lệ pin của bạn được ít nhất 1 người xác nhận.
- **1,860 people alerted:** số người đã nhận push từ pin của bạn. Cho người dùng thấy đóng góp của mình có ích thật.

## 5. Badges — huy hiệu

Badge là **thành tích vĩnh viễn**, không cộng rep. Mỗi badge có **một điều kiện rõ ràng**, có thanh tiến độ, và người dùng xem được toàn bộ danh sách (kể cả chưa đạt) trong Profile → Badges.

| Nhóm | Badge | Điều kiện trigger |
|---|---|---|
| City | **City Keeper · Ho Chi Minh City** | Check-in đủ toàn bộ 12 landmark MapChat gợi ý cho thành phố. Mỗi thành phố một badge. Người có badge này được nhãn ★ CITY KEEPER cạnh tên trong thread. |
| Place | Eyes on Dien Bien Phu | Nhiều pin kẹt xe được xác nhận nhất trên một con đường trong tháng · mỗi đường một người |
| Season | Flood watcher 2026 | Báo hoặc xác nhận 20 pin ngập trong mùa mưa 2026 |
| Community | First responder | Bấm "I'm coming" cho 3 SOS và tới trong 10 phút |
| Community | Fair seller | Đóng 10 pin For sale là "sold", không bị người mua báo cáo |
| Milestone | First 100 reports | Đăng 100 pin được ít nhất 1 người xác nhận |
| Milestone | First 500 confirmations | Xác nhận 500 pin của người khác |
| Milestone | 30-day / 100-day streak | Hoạt động liên tục 30 / 100 ngày |
| Milestone | Night owl | Đăng 30 pin trong 22:00–5:00 |
| Milestone | Photographer | Đính ảnh vào 100 pin hoặc check-in |
| Milestone | Trusted 100 | Đạt rep 100 và giữ 30 ngày |

Không còn khái niệm "Area lead"; City Keeper thay thế hoàn toàn.

## 6. Kiếm tiền

- **Promoted pin:** quán trả 25.000đ/giờ, chọn bán kính 500 m – 2 km. Pin hồng, ghi rõ "Promoted · paid by", có Claim offer → mã tại quầy, không có trust/confirm.
- **Thanh toán:** qua Stripe hoặc Airwallex (cổng, không tự giữ thẻ). Phương thức: thẻ Visa/Master/JCB, VietQR chuyển khoản, MoMo, Apple Pay. Cộng VAT 8%, gửi hóa đơn qua email, hoàn tiền nếu pin không lên. Pin bật ngay khi thanh toán được xác nhận (webhook).
- **Dữ liệu:** bản đồ ngập / kẹt theo giờ bán cho logistics, bảo hiểm, bất động sản.
- **Không** bán subscription cho người dùng cuối.

## 7. Rủi ro và cách xử lý trong thiết kế

| Rủi ro | Xử lý |
|---|---|
| Spam, tin giả | Rep có trọng số; pin của người rep thấp chờ xác nhận; 3 "Gone" là đóng |
| Không có nội dung lúc đầu | Pin tự động (camera, EVN, lịch chợ đêm, landmark) lấp trước; mời admin nhóm FB tham gia sớm, họ dễ lấy badge Eyes on … và Flood watcher đầu tiên |
| Mở app ít | Push theo tuyến đi làm + giờ đi làm; streak; landmark là lý do mở app lúc rảnh |
| Lừa đảo mua bán | For-sale không có thanh toán trong app; nhắc gặp nơi công cộng; pin đóng khi bán |
| SOS giả | Giữ 2 giây; gắn với tài khoản đã xác minh số điện thoại; lịch sử SOS ảnh hưởng rep |

## 8. MVP kỹ thuật

> **Đã thay thế (2026-09-16):** stack chính thức là NestJS + Supabase (Auth + Postgres/PostGIS) + Redis/BullMQ, mobile Flutter hoặc React Native gọi OpenAPI. Xem `docs/system-architecture.md`. Đoạn dưới giữ nguyên làm lịch sử.

*(Bản gốc: Flutter + Spring Boot + PostGIS)*

Cần: pin có `expires_at`, `type`, `trust_score`; geo-query quanh vị trí; vote xác nhận; push theo polygon / tuyến; crawler vài nguồn tự động; bảng `reputation_events`. Bỏ livestream, chat riêng, thanh toán ở giai đoạn này.

## 9. Màn hình đã thiết kế (30)

Welcome → 3 màn giới thiệu (bản đồ sống · pin có tuổi thọ và xác nhận · cảnh báo theo tuyến, landmark, SOS) → Sign in (Google / Facebook / Apple / email / số điện thoại) → OTP qua email hoặc SMS → Profile setup → Chọn thành phố → Home map → Pin detail (thread, ảnh) → Landmark → For sale → Promoted → Report → SOS (giữ / đã gửi) → My areas → Alerts → Profile → Account → Language → Business → Checkout → Receipt.
