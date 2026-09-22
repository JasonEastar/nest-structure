-- PostGIS cho cột geography (Drizzle không tự tạo extension). Kéo theo 3 bảng hệ thống của PostGIS:
-- spatial_ref_sys, geometry_columns, geography_columns — KHÔNG xoá, drizzle.config.ts đã bỏ qua chúng (extensionsFilters).
CREATE EXTENSION IF NOT EXISTS postgis;
