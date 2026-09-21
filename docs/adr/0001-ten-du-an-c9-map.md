# ADR-0001 — Tên dự án: c9_map

**Ngày:** 2026-09-16 · **Trạng thái:** Accepted

## Bối cảnh
README dùng "C9 Maps", prototype dùng "MapChat Live". Tên ảnh hưởng repo, package, bundle id, bucket R2, cache prefix, tên Supabase project.

## Quyết định
- Repo / package / Supabase project: `c9_map`. Văn bản: "C9 Map".
- Cache prefix `c9:`, queue prefix `c9`, bucket `c9-map-media`.
- "MapChat Live" chỉ còn là tên prototype trong `demo-html/`.

## Hệ quả
- Mọi tài liệu trong `docs/` dùng một tên. Tên hiển thị trên store quyết định sau, không ảnh hưởng code.
