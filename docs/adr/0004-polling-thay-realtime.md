# ADR-0004 — Polling + push thay cho WebSocket/SSE

**Ngày:** 2026-09-16 · **Trạng thái:** Accepted

## Bối cảnh
Prototype có SOS chia sẻ vị trí live, "N here now", thread responder. Đa instance, đội nhỏ, app di động phần lớn thời gian đóng.

## Quyết định
- Không WebSocket/SSE. Lớp Live poll 10–15 s, màn SOS poll 5 s, FCM cho mọi thứ khi app đóng.
- Vị trí live SOS lưu Redis key TTL 60 s (client POST mỗi 10 s), PG chỉ lưu start/end/last.

## Hệ quả
- Không cần sticky session, không cần pub/sub liên instance.
- Xem lại khi có chat hoặc cần < 5 s khi app chắc chắn mở.
