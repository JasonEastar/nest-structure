# C9 Map — Kiểm thử & CI/CD

**Cập nhật:** 2026-09-17 · **Trạng thái:** Active · **Chủ sở hữu:** Tech Lead
Tầng kiểm thử, kịch bản lõi, môi trường, pipeline và secrets. Quy ước code xem [code-standards.md](./code-standards.md).

---

## 1. Tầng kiểm thử

| Tầng | Công cụ | Phạm vi | Chạy ở |
|---|---|---|---|
| Unit | Vitest project `unit` — `test/unit/*.spec.ts` | Logic thuần, không hạ tầng: env schema, error shape, cursor, zod helper, EWKT/EWKB, PermissionGuard; sau này rep, tier, quantize bbox, state machine pin | Mỗi commit (`npm run test:unit`) |
| **Integration + E2E** | Vitest project `integration` — `test/integration/*.spec.ts`, testcontainers `postgis/postgis:16-3.4` + `redis:7-alpine` (globalSetup tự dựng + migrate), supertest qua `AppModule` thật | Geo repository, BullMQ scheduler/processor, cache/throttle, auth JWKS + RBAC (JWKS server trong test), Bull Board; `test/integration/supabase-real.spec.ts` chạy với Supabase thật khi có khoá | Mỗi PR (`npm run test:integration`) |
| Đa instance | `scripts/smoke-multi-instance.sh` (5 kiểm tra) trên `docker compose --profile full` | LB đến 2 instance, Redis chung, rate limit chung + `Retry-After`, JWT trên cả 2 instance, `X-Request-Id` giữ/sinh | Trước deploy (`TOKEN=$(node scripts/dev-token.mjs) npm run smoke`) |
| Load | k6 | Viewport 300 req/s p95 < 100 ms; "500 người mở app sau 1 push" | Hàng tuần |

## 2. Quy tắc

```
NEVER  mock PostGIS — test geo trên PostGIS thật (testcontainers)
MUST   mỗi truy vấn geo có test dữ liệu ở biên: đúng 200 m (check-in), 300 m (duplicate), 500 m (SOS), mép bbox
NEVER  fake data, mock, cheat, skip để pass build hoặc CI
MUST   test Supabase JWT bằng token ký thật từ Supabase dev project (admin.generateLink → verifyOtp), không tự ký giả
MUST   test đa instance chạy với 2 replica thật (docker-compose), không giả lập
MUST   mọi job BullMQ có test "chạy 1 lần dù 2 worker"
```

## 3. Kịch bản test lõi theo rủi ro

| Nhóm | Kịch bản | Tầng |
|---|---|---|
| Pin state machine | Chủ pin tự vote (cấm); vote 2 lần cùng user; vote sau expired; Gone thứ 3 trùng lúc job expire; ảnh + xác nhận cộng dồn | Unit + Integration |
| Rep | Rep âm → clamp 0; > 100 → clamp; −9 khi rep = 3; rep tài khoản đã xoá; tier tính từ rep lúc đăng | Unit |
| Chống lạm dụng | 3 tài khoản 1 `x-device-id` vote chéo; report brigading trên pin thật; 4 pin cùng type / 300 m / giờ; SOS 2 lần trong 5 phút | Integration + E2E |
| Geo | `ST_DWithin` đúng biên; ranh giới quận; GPS accuracy > 100 m; duplicate 299 m vs 301 m | Integration |
| Thời gian | Lưu UTC, hiển thị Asia/Ho_Chi_Minh; area schedule 8:00–19:00 ở biên; lịch chợ đêm qua nửa đêm | Unit + Integration |
| Push | Pending không push; user trong 2 areas nhận 1 lần; collapse key; token chết; tier 80+ ưu tiên; vi/en plural | Integration |
| SOS (gđ 2) | 500 recipients 0 trùng; latency < 5 s; "I'm safe" đóng mọi thứ; kill switch | E2E |
| Thanh toán (gđ 3) | Webhook 2 lần → 1 pin; trả xong pin không lên → refund; VND không thập phân; VAT làm tròn | E2E |
| Auth | Token hết hạn → 401; `aud` sai → 401; profile sync lần đầu; delete account rồi đăng ký lại cùng SĐT | E2E |
| Đa instance | 5 test §1 + chaos `docker compose kill api-1` giữa fan-out | Script |
| Ảnh | EXIF GPS bị strip; HEIC → WebP; > 10 MB bị từ chối; presigned hết hạn 5 phút | Integration |
| Cache | Sửa pin → `del c9:v1:marker:{id}`; viewport public không chứa dữ liệu theo viewer | Integration |

## 4. Môi trường

| Môi trường | Auth + DB | API | Redis | Dữ liệu |
|---|---|---|---|---|
| `local` | Auth: Supabase dev project (hosted). DB: `postgis/postgis:16-3.4` container | docker-compose `api-1`, `api-2`, `nginx` | docker `redis:7-alpine` | Seed script |
| `staging` | Auth: Supabase project staging. DB: Postgres container tự host | EC2 docker-compose 2 replica | Redis container | Seed hoặc ẩn danh từ prod |
| `prod` | Auth: Supabase project prod. DB: Postgres container tự host (backup S3, PITR) | EC2 docker-compose 2 replica + nginx | Redis container | Thật |

Lệnh dev: `npm run dev:infra` (= `docker compose up -d postgres redis`) rồi `npm run dev`. Test integration không cần `dev:infra` (testcontainers tự dựng, ~10 s); đặt `TEST_REUSE_INFRA=1` để dùng Postgres/Redis trong `.env` (nhanh hơn khi lặp). Các file integration chạy tuần tự (`fileParallelism: false`) vì dùng chung Redis.

## 5. Pipeline CI

```
.github/workflows/ci.yml (push main + PR)
  check:         npm ci → lint → typecheck → test:unit → test:integration (Docker sẵn trên ubuntu-latest) → build → openapi/*.json (artifact)
  docker:        needs check → build image target runtime (không push, cache GHA)
  supabase-real: needs check, chỉ push + repo variable SUPABASE_REAL_TESTS=true + secrets SUPABASE_* → test/integration/supabase-real.spec.ts
sau này:         migrate (bước riêng) → deploy → smoke (5 test đa instance)
```

| Bước | Ghi chú |
|---|---|
| `lint`, `typecheck` | Mỗi commit. `arch:check` (dependency-cruiser) thêm khi đội > 3 |
| `test:integration` | Testcontainers cần Docker trên runner |
| `build image` | Multi-stage Dockerfile, tag = git sha |
| `openapi.json` | Export tại build, upload artifact → mobile codegen (Flutter `openapi-generator dart-dio` hoặc RN `openapi-typescript`) |
| `migrate` | `drizzle-kit migrate` chạy riêng trước deploy, có `pg_advisory_lock`; NEVER lúc boot |
| `deploy` | Rolling: `api-2` trước, health ok, rồi `api-1` |
| `smoke` | `npm run smoke` 5 test đa instance (+ chaos kill sau); đỏ → rollback |

Dừng ở bước đỏ. Không merge khi test đỏ.

## 6. Secrets

```
MUST   commit .env.example; NEVER commit .env
MUST   SUPABASE_SECRET_KEY (sb_secret_…) chỉ ở server (NestJS) và GitHub secrets; NEVER gửi cho mobile/web
MUST   mobile chỉ dùng SUPABASE_PUBLISHABLE_KEY (sb_publishable_…) + URL
MUST   prod dùng AWS Secrets Manager hoặc Docker secrets; NEVER secret trong image hoặc log
MUST   pino redact: authorization, cookie, token, otp, phone, lat/lng chính xác của user
```

## 7. Quality gates

| Gate | Ngưỡng |
|---|---|
| Coverage service logic (unit) | ≥ 80 % |
| Coverage `*-geo.repository.ts` (integration) | 100 % hàm có test biên |
| Viewport p95 | < 100 ms @ 300 req/s (k6, staging) |
| SOS fan-out (gđ 2) | < 5 s tới 500 recipients |
| Đa instance smoke | 5/5 pass trước mỗi deploy |
| Build | 0 lỗi typecheck, 0 lỗi lint blocking |
