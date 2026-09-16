# C9 Map — Phân tích dự án (PM · QA · Tech Lead)

**Cập nhật:** 2026-09-16 · **Trạng thái:** Active · **Chủ sở hữu:** Tech Lead
Phân tích ban đầu khi README và prototype còn mâu thuẫn. Phần lớn mục 1 và 5 **đã được xử lý cùng ngày** (xem ghi chú đầu mục). Giữ lại làm bối cảnh cho các quyết định.

> **Trạng thái sau chuẩn hoá 2026-09-16:** tên `c9_map` (ADR-0001), stack NestJS + Supabase (ADR-0002), bỏ Social (ADR-0003), polling (ADR-0004). PRD hợp nhất = [project-overview-pdr.md](./project-overview-pdr.md); lộ trình = [project-roadmap.md](./project-roadmap.md); quyết định chờ = [decisions-pending.md](./decisions-pending.md). Bước A, B, D của mục 5 đã xong; bước C (traceability màn hình → endpoint) và E (PLAN) nằm trong `plans/`.

**Nguồn đọc:** `README.md` (brief backend), `demo-html/MapChat - Project Overview.md`, 2 prototype HTML (30 màn hình), `docs/`, `docs-vi/`
**Mục đích:** liệt kê những gì dự án **nên làm trước khi viết code**, kèm lý do ngắn. Không code.

---

## 0. Kết luận 1 phút

- **README và demo đang mô tả hai sản phẩm khác nhau.** README = "bản đồ cộng đồng + mạng xã hội + chủ shop". Demo = "bản đồ sống có tuổi thọ + uy tín + cảnh báo theo khu vực". Chưa thể bắt đầu bước 1 khi chưa hợp nhất.
- **Demo là nguồn sự thật tốt hơn** — nó chi tiết, tự nhất quán, đã nghĩ tới rủi ro. README nên được chỉnh theo demo, không phải ngược lại.
- **Cắt được ~40% phạm vi backend** (Social module, shop claim, moderator theo vùng) nếu bám theo demo.
- **Việc cần làm ngay:** (1) chốt tên + stack, (2) viết 1 PRD hợp nhất + state machine của pin + công thức rep, (3) trả lời `decisions-pending.md`, (4) dọn `docs/`. Sau đó mới tới bước 1–7 trong project-roadmap.md.

---

## 1. Mâu thuẫn README ↔ Demo (phải chốt trước)

| # | Chủ đề | README nói | Demo nói | Khuyến nghị |
|---|---|---|---|---|
| 1 | Tên | C9 Maps, prefix `c9:` | MapChat Live, `MC-4471` | Chốt 1 tên. Ảnh hưởng bundle id, bucket, cache key, email domain |
| 2 | Stack | NestJS + RN Expo | Overview §8: Flutter + Spring Boot | Giữ README (đã "chốt"). Sửa overview để không ai đọc nhầm |
| 3 | Social | posts, follow, feed×3, profile, checkin private | **Không có** post/follow/feed. Chỉ thread trên pin, like, check-in landmark | **Bỏ Social module khỏi MVP** → tiết kiệm 2–3 tuần + bỏ lớp dữ liệu "phức tạp nhất" |
| 4 | Places | Người dùng tạo quán ăn/camping vĩnh viễn, chủ shop claim | Chỉ **Landmark do admin tạo** (12/thành phố). Fishing/street food là pin tạm 3h | Bỏ user-created Places + claim. Places = landmarks admin + venue của promoted |
| 5 | Uy tín | `trust_score`, `confirmation_count` trên marker | Rep 0–100 **theo user**, tier <40/40–79/80+/100, +4/+2/+3/+5/−9, pending state | Thiết kế lại: `reputation_events` + rep vật chất hoá + trust của pin tính từ rep người xác nhận |
| 6 | Cảnh báo | `user_locations` 1 dòng/user, `sos_alerts_enabled` | **My areas**: Home/Work, bán kính 1–2 km, lịch 8:00–19:00, bật/tắt từng loại; + cảnh báo theo **tuyến đi làm** | Cần bảng `user_alert_areas` riêng. Tuyến đi làm → hoãn sang gđ sau (cần lưu linestring, phức tạp) |
| 7 | Auth | SĐT là mỏ neo, OTP SMS, Google + Apple; mọi endpoint ghi cần phone verified | Email OTP là luồng chính ("no password"), phone tuỳ chọn, + Facebook | Mỏ neo = `user_id` + bảng `user_identities`. Phone verified chỉ bắt buộc cho SOS, đăng pin, promoted |
| 8 | Thanh toán | VNPay / Momo | Stripe hoặc Airwallex, thẻ, VietQR, MoMo, Apple Pay, VAT 8%, hoá đơn email | **Stripe không hỗ trợ merchant VN.** Chọn 1 cổng VN (VNPay/MoMo/SePay VietQR) + Airwallex nếu cần thẻ quốc tế. Hoá đơn VAT = hoá đơn điện tử theo NĐ 123/2020 → cần nhà cung cấp riêng |
| 9 | Nhắn tin | KHÔNG có | For sale có "Ask seller", "I'll take it → seller notified" | Không làm chat. "Ask seller" = reply trong thread; "I'll take it" = reservation + push. Hoặc hoãn For sale |
| 10 | Realtime | Không socket, polling + FCM | SOS chia sẻ **vị trí live**, "27 here now", responder thread, "live views" | Giữ polling: SOS 5s, map 10–15s. Vị trí live SOS lưu Redis TTL, không PG |
| 11 | Pin tự động | Không đề cập | Camera giao thông, EVN, SAWACO, lịch chợ đêm, badge ⚙ | Module `ingest` mới. Kiểm tra pháp lý/ToS từng nguồn trước khi crawl |
| 12 | Kiểm duyệt | Moderator theo vùng, `moderator_assignments` | "Không có area lead, mọi người bình đẳng", 3 report = ẩn, "reviewed within minutes" | Giữ admin dashboard tối thiểu (xem report, xoá, ban). Bỏ assignment theo vùng ở MVP |
| 13 | Ngôn ngữ | vi mặc định | en / vi / ko / ja | Xác nhận thật sự cần ko/ja (expat?) — mỗi ngôn ngữ nhân 4 template push |
| 14 | Docs | Tham chiếu 3 file `docs/c9-maps-*.md`, `docs/tang-xuyen-suot-*.md`, `docs/cau-hinh-nestjs-modulith.md` | — | **3 file không tồn tại.** `docs/` hiện là boilerplate ClaudeKit (PDR, roadmap nói về ClaudeKit) |

---

## 2. Góc nhìn PM — sản phẩm & phạm vi

### 2.1 Chốt MVP thật sự nhỏ
- **Chỉ HCMC, 5 loại pin user + landmark + outage tự động.** Vì: mỗi loại pin = 1 schema attrs + 1 template push × 4 ngôn ngữ + test. 12 loại ngay từ đầu là quá tải cho 1–2 người.
  - Gợi ý MVP: Traffic, Flooding, Night market, Event, Street food + Landmark (check-in) + Power/water outage (auto).
  - Gđ 2: Scenic, Fishing, SOS. Gđ 3: Promoted + thanh toán. Gđ 4: For sale.
- **SOS không nên ở MVP** dù là điểm khác biệt. Vì: pháp lý (kỳ vọng cấp cứu), cần verified phone, cần fan-out 500 m, cần runbook, cần kill switch. Làm sau khi có vòng lặp pin ổn.
- **For sale hoãn.** Vì: kéo theo reservation, nhắn tin, lừa đảo, báo cáo người mua, badge Fair seller — gần như 1 mini-marketplace.
- **Promoted hoãn tới khi có DAU.** Vì: quán chỉ trả 25k/giờ khi có người xem. Chưa có người dùng thì chưa có doanh thu, còn thanh toán + VAT invoice tốn 2–3 tuần.

### 2.2 Viết PRD hợp nhất (thay cho README + overview)
- **1 file `docs/project-overview-pdr.md`** làm nguồn sự thật, README chỉ giữ quy tắc kỹ thuật. Vì: hiện tại Claude Code (và người mới) sẽ đọc 2 tài liệu mâu thuẫn và tự chọn sai.
- **State machine của pin** viết ra thành bảng: `pending → live → expired | hidden | removed | sold | closed`, kèm điều kiện chuyển và ai được chuyển. Vì: đây là logic lõi, demo mô tả rải rác ở 4 màn hình.
- **Công thức rep viết thành số cụ thể** (hiện là "công thức gợi ý"). Rep floor/ceiling, decay theo thời gian, rep của người xác nhận có ảnh hưởng trọng số không. Vì: QA không test được "gợi ý".
- **Bảng rate limit theo sản phẩm** gom một chỗ: 1 pin/2 phút, 3 cùng loại/300 m/giờ, 5/15/∞ pin/ngày theo tier, report 10/giờ, SOS 1/5 phút. Vì: README và demo có 2 bộ số khác nhau.
- **Traceability 30 màn hình → endpoint.** Vì: đảm bảo không màn nào bị quên (Language, Account, Badges, How pins go live đều cần API).

### 2.3 Tính năng demo còn thiếu (sẽ bị App Store / người dùng hỏi)
- **Block user** — Apple Guideline 1.2 bắt buộc với UGC. Demo chỉ có Report.
- **Sửa / xoá pin của mình**, đóng pin sớm. Demo chỉ có "Mark as sold" cho For sale.
- **Xin quyền push** + cài đặt giờ yên lặng. Demo có schedule theo area nhưng không có quiet hours toàn cục.
- **Empty state / no GPS / offline** — bản đồ trống ngày đầu là rủi ro số 1 (overview tự nhận).
- **Khôi phục tài khoản** khi mất email/SĐT; **gộp tài khoản** khi Google + phone cùng người.
- **Xác minh venue cho Promoted** — hiện ai gõ tên quán nào cũng được → mạo danh, quảng cáo bậy.
- **Trang Terms / Privacy / Xoá dữ liệu** thật (link trong onboarding).
- **Onboarding "sao pin của tôi mờ?"** đã có màn "How pins go live" — tốt, giữ.

### 2.4 Pháp lý & vận hành (VN)
- **NĐ 13/2023 (PDPD):** consent vị trí chính xác, retention policy viết ra (`user_locations` 30 ngày, SOS location 24h, log 14 ngày), export/delete account. Demo đã có "Delete account" → cần cascade rõ: pin ẩn danh hoá, thread giữ hay xoá.
- **Emergency contacts** là dữ liệu cá nhân **của bên thứ ba** (SĐT mẹ, bạn) → cần cơ chế thông báo/consent, chỉ lưu băm + 4 số cuối, gửi SMS có tốn tiền.
- **SOS disclaimer** ngay trên màn: "không thay thế 113/114/115" (demo đã có số gọi trực tiếp → tốt).
- **Bán dữ liệu ngập/kẹt cho logistics/bảo hiểm** → phải ẩn danh hoá + ghi trong Privacy từ ngày 1, không thêm sau.
- **Crawl EVN/SAWACO/camera** → kiểm tra ToS, có thể cần thoả thuận. Fallback: nhập tay bởi admin.
- **Hoá đơn VAT** = hoá đơn điện tử có mã cơ quan thuế → tích hợp Viettel/MISA/…, không tự sinh PDF.

### 2.5 Chỉ số thành công (định nghĩa trước khi launch)
- Pin mới/ngày, **thời gian tới xác nhận đầu tiên** (median), % pin được xác nhận, % pin bị "Gone"/report.
- D1/D7 retention, tỉ lệ bật push, tỉ lệ tạo My areas.
- SOS: số SOS thật vs giả, thời gian có người "I'm coming".
- Vì: demo có "Your impact this week" — metric nội bộ nên dùng cùng nguồn số với metric cho user.

### 2.6 Chiến lược cold start
- Seed **12 landmark HCMC + lịch chợ đêm + lịch cắt điện** trước ngày 1. Vì: người dùng mở app thấy bản đồ trống sẽ không quay lại.
- Mời admin nhóm FB giao thông làm "seed user" (overview đã nêu) — cần **cơ chế invite + rep khởi điểm cao hơn** (vd 60) cho họ.

---

## 3. Góc nhìn QA — kiểm thử & chất lượng

### 3.1 Spec phải kiểm được
- **Mọi con số trong demo thành acceptance criteria**: tuổi thọ mặc định từng loại, ngưỡng 3 Gone / 3 report, nửa tuổi thọ ẩn, +4/+2/+3/+5/−9, 500 m SOS, 2 giây giữ, 10 phút OTP email (demo) vs 5 phút (README).
- **Bảng quyết định visibility** theo (rep tier × có ảnh × số xác nhận × viewer là chủ pin). Vì: đây là chỗ dễ sai nhất và ảnh hưởng trực tiếp cache.
- **Test data chuẩn HCMC**: 50k marker OSM, điểm nằm đúng ranh 300 m / 500 m / bbox, 2 pin cùng loại cách 299 m và 301 m.

### 3.2 Nhóm test lõi (theo thứ tự rủi ro)
- **Pin state machine:** chủ pin tự xác nhận (phải cấm), xác nhận 2 lần cùng user, xác nhận sau expired, "Gone" thứ 3 đúng lúc job expire chạy, ảnh tính 1 xác nhận có cộng dồn với xác nhận người khác không.
- **Rep:** rep âm, rep >100, −9 khi rep = 3, rep của tài khoản bị xoá, rep thay đổi giữa lúc đăng và lúc xác nhận (dùng rep lúc nào?).
- **Chống lạm dụng:** 3 tài khoản 1 máy xác nhận chéo (device id), report brigading 3 người xoá pin thật (cần trọng số rep người report), spam 3 pin/300 m, SOS giả liên tiếp, mock GPS.
- **Geo:** ST_DWithin đúng biên, ranh giới quận, độ chính xác GPS > 100 m thì có cho đăng không, xác nhận khi đang di chuyển 60 km/h.
- **Thời gian:** lưu UTC, hiển thị Asia/Ho_Chi_Minh; lệch đồng hồ client → vòng thời gian đếm ngược sai; lịch chợ đêm "tới 23h" qua nửa đêm; area schedule 8:00–19:00 ở biên.
- **Push:** pending không bao giờ push; area schedule; dedupe 1 pin → 1 user dù nằm trong 2 areas; collapse key; token chết; rep 80+ ưu tiên; 4 ngôn ngữ × plural.
- **SOS:** fan-out 500 người 0 trùng (README), latency < 5 s, "I'm safe" đóng mọi thứ, responder thread chỉ người trong 500 m, kill switch hoạt động.
- **Thanh toán:** webhook idempotent, trả 2 lần, trả xong pin không lên → refund, VND không thập phân, VAT làm tròn, "Extend hours" tính tiền thế nào, thời gian bắt đầu = lúc webhook.
- **Auth:** OTP brute force (5 lần/15 phút), refresh reuse → thu hồi hết, gộp Google + phone + email cùng người, delete account rồi đăng ký lại cùng SĐT.
- **Đa instance:** 6 test bash README §7 + chaos `docker compose kill api-1` giữa fan-out.
- **Ảnh:** EXIF GPS bị strip chưa (ảnh public lộ vị trí nhà), HEIC → WebP, 10 MB, ảnh NSFW trong gallery landmark.

### 3.3 Môi trường & công cụ
- **Staging 2 replica** giống prod từ tuần đầu (README đã yêu cầu — phải giữ).
- **Contract test** mobile ↔ API từ OpenAPI. Vì: 1–2 người, không có thời gian test tay 30 màn.
- **k6 viewport 300 rps p95 < 100 ms** (README) + thêm kịch bản "500 người mở app cùng lúc sau 1 push kẹt xe" — đây là traffic thật.
- **Feature flag + kill switch** cho SOS, promoted, từng nguồn ingest — QA cần tắt được mà không deploy.
- **Sentry + requestId** hiện trong app (màn Account, ẩn) để user gửi kèm khi báo lỗi.

### 3.4 UX QA
- SOS giữ 2 giây: test vô tình chạm trong túi; rung/countdown rõ.
- Low-end Android + mạng 3G: bản đồ 37 pin + ảnh thumbnail 200 px.
- Dark mode, font tiếng Việt có dấu, ko/ja không vỡ layout.

---

## 4. Góc nhìn Tech Lead — kiến trúc & kỹ thuật

### 4.1 Giữ nguyên (đúng, đừng mở lại)
- NestJS modulith `APP_ROLE`, Drizzle + PostGIS, Redis + BullMQ, R2 presigned, polling thay socket, UUID v7, cursor pagination, outbox từ gđ 3, 2 replica từ ngày đầu, ST_DWithin + GIST, `user_locations` UPSERT. Vì: README §3 đã đúng và phù hợp đội 1–2 người.

### 4.2 Sửa lại module & schema theo demo
- **Module mới thay cho `social` + `billing/claim`:**
  - `pin` (marker, photo, geo, vote confirm/gone, thread reply, like, report)
  - `reputation` (`reputation_events`, tier, badge, streak, weekly impact)
  - `alert` (`user_alert_areas`, notification, push, fan-out)
  - `landmark` (admin-curated, check-in, gallery, "here now")
  - `sos` (session, live location Redis, responders, emergency contacts)
  - `promoted` (order, payment, offer code, impression stats) — gđ 3
  - `ingest` (source adapters, dedupe theo `source_ref`) — gđ 2
  - `moderation` (report queue, admin action, ban) — tối thiểu
- **Bảng cần thêm** so với README §4.2: `user_identities`, `reputation_events`, `user_alert_areas` (geography + radius + time window + categories[]), `pin_votes` (UNIQUE user+pin), `pin_replies`, `pin_likes`, `badges` + `user_badges` + `badge_progress`, `user_activity_days` (streak), `landmark_checkins`, `emergency_contacts` (hash + last4), `sos_sessions`, `promoted_orders` + `offer_claims`, `ingest_sources`, `cities`.
- **`markers` thêm cột:** `status` enum, `source` (user/auto/admin/promoted), `city_code`, `photo_count`, `confirm_count`, `gone_count`, `report_count`, `author_rep_at_post`. Vì: visibility tính từ những cột này, không join.
- **Bỏ:** `posts`, `follows`, feed, `moderator_assignments`, `claims`. Vì: không có trong demo (YAGNI).

### 4.3 Quyết định kỹ thuật cần chốt sớm (ảnh hưởng schema/cache)
- **Viewport cache public, pin của tôi overlay riêng.** Pending pin hiện mờ cho mọi người, rõ cho chủ → nếu server trả khác theo viewer thì không cache được. Giải: `/pins/viewport` luôn public (pending = faded), client gọi `/me/pins` và vẽ đè. Giữ README rule "không cache nội dung theo quyền".
- **Rep tính event-sourced.** `reputation_events` là nguồn, `users.rep` là cache, job tính lại theo lịch + `INCR` tức thời. Vì: đổi công thức sau này không mất lịch sử; demo hiển thị "8 more to reach 100".
- **Badge engine bất đồng bộ** qua outbox → job đánh giá rule. Không tính trong request. Vì: 11 badge × mỗi hành động = chậm và dễ race.
- **Fan-out 2 kiểu targeting khác nhau:** pin go-live → `user_alert_areas` (ST_DWithin + schedule + category + rep tier ưu tiên); SOS → `user_locations` 500 m. Hai partial GIST index riêng.
- **SOS live location:** Redis key `c9:sos:{id}:loc` TTL 60 s, client POST mỗi 10 s, responder poll 5 s. PG chỉ lưu start/end/last. Vì: README cảnh báo GIST bloat với bảng lịch sử.
- **Trust của pin** = f(rep người đăng, số xác nhận, rep người xác nhận, tuổi) — viết công thức, cache 10 s cùng viewport.
- **Duplicate detection** khi tạo pin: query cùng loại trong 300 m còn sống → trả `DUPLICATE_NEARBY` + id để client hỏi "xác nhận thay vì đăng?". Cần trước khi rate limit 3/300 m có ý nghĩa.
- **Reverse geocoding** ("Nguyen Hue, District 1") — Google tính phí mỗi call. Cache theo geohash 7 hoặc dùng Nominatim self-host. Quyết định trước khi làm màn Create.
- **PhoneVerifiedGuard theo hành động** thay vì mọi endpoint ghi: like/reply/confirm → không cần; đăng pin/SOS/promoted → cần. Vì: demo cho đăng nhập bằng email.
- **Thanh toán:** chọn 1 cổng VN có VietQR + MoMo (VNPay hoặc SePay) và hoãn thẻ quốc tế. Webhook → outbox → kích hoạt pin. Hoá đơn điện tử qua nhà cung cấp.
- **`packages/contracts` (nay `libs/contracts`):** zod discriminated union cho `attrs` từng loại pin, `ErrorCodes`, bảng rate limit, bảng tuổi thọ mặc định, tier rep. Vì: 3 đầu (api/web/mobile) cùng đọc số giống nhau.

### 4.4 Bảo mật & riêng tư (thêm vào README §3.4)
- Strip EXIF (GPS) mọi ảnh trong job `media`. Vì: ảnh check-in/pin public lộ toạ độ thật.
- NSFW/text moderation cơ bản (banned words, image classifier rẻ) trước khi vào gallery.
- Emergency contact: HMAC + last4, không log; SMS gửi qua provider, giới hạn 1/5 phút.
- Admin: 2FA, audit log mọi hành động moderation.
- Anonymity: `author_id` không ra DTO public (README) — nhưng thread hiển thị tên + badge CITY KEEPER → định nghĩa rõ "ẩn danh trên pin, hiện tên trong thread" trong DTO.

### 4.5 Chi phí cần ước lượng trước
- SMS OTP (~500–800 đ/tin) → ưu tiên email OTP + Google, SMS chỉ khi cần verified.
- Google Maps: SDK mobile miễn phí, Geocoding/Places tính phí → cache mạnh.
- FCM miễn phí; R2 gần như miễn phí; EC2 + RDS + ElastiCache ~ 100–150 USD/tháng gđ 1.
- Hoá đơn điện tử + cổng thanh toán: phí % + phí cố định.

### 4.6 Dọn repo & tài liệu
- `docs/` hiện là boilerplate ClaudeKit (PDR, roadmap, architecture nói về ClaudeKit) → chuyển vào `guide/` hoặc xoá, thay bằng docs của C9. Vì: agent đọc `docs/system-architecture.md` sẽ hiểu sai dự án.
- Tạo 3 file README tham chiếu hoặc xoá tham chiếu.
- Overview §8 (Flutter + Spring Boot) → sửa hoặc ghi chú "đã thay bằng README §2".
- `docs/adr/0001-*.md` cho: tên dự án, bỏ Social, cổng thanh toán, auth anchor, polling SOS.
- `docs/decisions-pending.md` (đã tạo).

---

## 5. Thứ tự làm đề xuất (trước bước 1 của README §10)

| Bước | Việc | Output | Ước lượng |
|---|---|---|---|
| A | Chốt tên, stack, 5 quyết định README §11 + 10 quyết định mới | `decisions-pending.md` có câu trả lời | 1 ngày |
| B | PRD hợp nhất: phạm vi MVP, state machine pin, công thức rep, bảng rate limit, bảng tuổi thọ, visibility matrix | `docs/project-overview-pdr.md` | 3–4 ngày |
| C | Traceability 30 màn → endpoint → bảng | `docs/screen-api-map.md` (chưa viết) | 1 ngày |
| D | Sửa README §4.2/§5 theo PRD, dọn `docs/`, viết ADR | README + `docs/adr/` | 1 ngày |
| E | Chạy bước 0 của README (PLAN.md) | `docs/PLAN.md` | 0.5 ngày |
| F | Bước 1–7 README (skeleton → marker core) | code | 2–3 tuần |

---

## 6. Rủi ro lớn nhất (top 5)

1. **Bắt đầu code với 2 tài liệu mâu thuẫn** → làm Social module không ai dùng. Phòng: bước A–B trước.
2. **Cold start** — bản đồ trống. Phòng: seed landmark + lịch + seed user trước launch.
3. **SOS** — pháp lý và kỳ vọng cấp cứu. Phòng: hoãn gđ 2, disclaimer, kill switch, runbook.
4. **Visibility/pending logic sai** → cache lệch, người dùng thấy pin "biến mất". Phòng: visibility matrix + test bảng quyết định.
5. **Thanh toán/VAT** tốn thời gian gấp đôi dự kiến. Phòng: hoãn tới khi có DAU, chọn cổng có VietQR sẵn.

---

## 7. Câu hỏi chưa giải quyết
- Xem `docs/decisions-pending.md`.
