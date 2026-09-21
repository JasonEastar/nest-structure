-- Extensions cần trước mọi schema có cột geography / tìm kiếm không dấu.
-- Drizzle không tự tạo extension (guide PostGIS) → migration viết tay.
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
