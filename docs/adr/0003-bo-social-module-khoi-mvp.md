# ADR-0003 — Bỏ Social module (post / follow / feed) và shop claim khỏi phạm vi

**Ngày:** 2026-09-16 · **Trạng thái:** Accepted

## Bối cảnh
README mô tả lớp Social (bài đăng, follow, feed×3, checkin private) và chủ shop claim địa điểm. Prototype 30 màn hình không có bất kỳ màn nào cho các chức năng này; engagement của sản phẩm nằm ở thread trên pin, like, xác nhận, check-in landmark, uy tín.

## Quyết định
- Không xây `posts`, `follows`, feed, `claims`, `moderator_assignments` theo vùng.
- Thay bằng module `engagement` (vote, thread, like, report, check-in) và `reputation` (events, tier, badge, streak).
- Places = landmark do admin quản lý + venue của promoted pin.

## Hệ quả
- Giảm ~40% phạm vi backend, bỏ lớp dữ liệu "riêng từng người" khó cache nhất.
- Nếu sau này cần follow/feed → ADR mới, thiết kế lại từ nhu cầu thật.
