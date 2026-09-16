# Phase 02 — Docker: `api` ×2 + nginx + Postgres/PostGIS + Redis

## Context links
- [plan.md](./plan.md) · [code-standards §2.1 đa instance](../../docs/code-standards.md) · [system-architecture §14](../../docs/system-architecture.md) · [ADR-0005](../../docs/adr/0005-postgres-rieng-supabase-chi-auth.md) · [ADR-0006](../../docs/adr/0006-all-in-one-cau-truc-don-gian.md)

## Overview
**Ngày:** 2026-09-16 · **Ưu tiên:** P0 · **Trạng thái:** ☐ Chưa bắt đầu
Chạy dev với **2 instance cùng một image** sau nginx từ ngày đầu; Postgres 16 + PostGIS và Redis trong compose; Auth dùng Supabase hosted dev project qua `.env`.

## Key insights
- DB riêng: image `postgis/postgis:16-3.4` (đã có local). Không `supabase start`, không thư mục `supabase/` — Google OAuth cần project thật; CLI local kéo ~12 container chỉ để có GoTrue.
- Cùng một service `api` chạy 2 bản: dùng `deploy.replicas: 2` **hoặc** hai service `api-1`/`api-2` (để bind port test thẳng 3001/3002). Chọn hai service tường minh ở dev; prod dùng `--scale api=N`.
- Kết nối DB direct `prepare: true`: container `postgres://c9:c9@postgres:5432/c9_map`, host `127.0.0.1:5432`. Một `DATABASE_URL` cho app và migrate.
- nginx `least_conn`, **NEVER `ip_hash`**. `stop_grace_period: 60s` vì processor chạy cùng process (đợi job xong).
- Không có `APP_ROLE`; mọi instance giống hệt nhau.

## Requirements
- `npm run dev:infra` = `docker compose up -d postgres redis`; `npm run dev:infra:full` thêm `api-1 api-2 nginx`.
- `curl :3000/health/live` ×10 → thấy đủ 2 `X-Instance-Id`.
- `docker compose kill api-1` → `:3000/health/live` vẫn 200.
- Ports: nginx 3000 (publish duy nhất), api-1 3001 / api-2 3002 (bind 127.0.0.1), postgres 5432, redis 6379.

## Architecture
```
docker-compose.yml
├── postgres  postgis/postgis:16-3.4 · POSTGRES_USER=c9 PASSWORD=c9 DB=c9_map · 127.0.0.1:5432 · volume pg-data · healthcheck pg_isready
├── redis     redis:7-alpine --appendonly yes · 127.0.0.1:6379 · volume redis-data · healthcheck redis-cli ping
├── api-1     build Dockerfile target dev · env INSTANCE_ID=api-1 · depends_on postgres/redis healthy · 127.0.0.1:3001:3000 · volume ./src (watch)
├── api-2     ... INSTANCE_ID=api-2 · 127.0.0.1:3002:3000
└── nginx     nginx:1.27-alpine · 3000:80 · nginx.conf ro · depends_on api-1/api-2
Dockerfile      # deps → build (nest build → dist/) → runtime node:22-alpine · USER node · HEALTHCHECK /health/live; target dev = nest start --watch
nginx.conf      # upstream api { least_conn; server api-1:3000; server api-2:3000; keepalive 32; } · proxy X-Request-Id $request_id · X-Forwarded-For
src/common/request-context.middleware.ts   # set X-Instance-Id (từ env) + echo/sinh X-Request-Id — bản đầy đủ ở phase 04
```
Extensions `postgis`, `unaccent`, `pg_trgm` do migration 0000 tạo (phase 03); image đã có sẵn.

## Related code files (CREATE)
- `docker-compose.yml`, `nginx.conf`, `Dockerfile`, `.dockerignore`
- `src/common/request-context.middleware.ts` (chỉ `X-Instance-Id` ở phase này) + `AppModule.configure(consumer).apply(...).forRoutes('*')`
- `package.json` scripts `dev:infra`, `dev:infra:full`, `dev:infra:down`
- `.env.example` bổ sung `DATABASE_URL`, `REDIS_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

## Implementation steps
1. `Dockerfile` multi-stage: `deps` (`npm ci`), `build` (`npm run build`), `runtime` (`node:22-alpine`, copy `dist/` + `node_modules` prod, `USER node`, `CMD node dist/main.js`, `HEALTHCHECK curl /health/live`); stage `dev` (`nest start --watch`, mount `src`).
2. `.dockerignore`: `node_modules`, `dist`, `.git`, `docs`, `plans`, `.env`.
3. `nginx.conf` như Architecture; `keepalive_timeout 60s`; `proxy_http_version 1.1`.
4. `docker-compose.yml` như Architecture; `env_file: .env`; `stop_grace_period: 60s` cho api.
5. `request-context.middleware.ts`: `res.setHeader('X-Instance-Id', env.INSTANCE_ID)`; đăng ký trong `AppModule.configure`.
6. Scripts `dev:infra*`; cập nhật `.env.example`; README quick start.
7. Chạy `dev:infra:full`, curl 10 lần, kill api-1, kiểm 200.

## Todo
- [ ] Dockerfile (dev + runtime) + .dockerignore
- [ ] nginx.conf least_conn + keepalive + headers
- [ ] docker-compose.yml 5 service + healthcheck + volume
- [ ] middleware X-Instance-Id
- [ ] scripts + .env.example

## Success criteria
```
npm run dev:infra && docker compose ps            # postgres, redis healthy
psql postgres://c9:c9@127.0.0.1:5432/c9_map -c "select 1"
npm run dev:infra:full
for i in $(seq 10); do curl -s -D - :3000/health/live -o /dev/null | grep X-Instance-Id; done | sort -u | wc -l   # 2
docker compose kill api-1 && curl -s -o /dev/null -w "%{http_code}" :3000/health/live   # 200
```

## Risk assessment
| Rủi ro | Phòng |
|---|---|
| Hot reload trong container chậm trên macOS | Dev thường chạy `nest start --watch` trên host, chỉ `dev:infra:full` khi test đa instance |
| nginx đọc `X-Request-Id` client gửi tuỳ ý | nginx luôn ghi đè bằng `$request_id` (phase 04 quyết định giữ hay tin client) |
| Port 5432 trùng Postgres local của máy | Đổi mapping `5433:5432` trong compose override cá nhân |

## Security considerations
- Chỉ nginx publish ra ngoài; postgres/redis/api bind `127.0.0.1`.
- Container chạy `USER node`; `.env` không vào image.

## Next steps
→ [phase-03](./phase-03-database-drizzle-postgis.md): Drizzle, migration đầu, schema identity.
