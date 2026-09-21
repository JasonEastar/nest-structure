# C9 Map — Deploy staging (1 máy, Docker Compose)

**Cập nhật:** 2026-09-21 · **Trạng thái:** Active · **Chủ sở hữu:** Tech Lead
Cách đơn giản nhất cho giai đoạn dev: 1 máy (EC2 / ECS) chạy `docker-compose.staging.yml` — nginx (cùng `nginx.conf` với dev) → api-1, api-2 → postgres, redis, HTTP port 80. Không CI deploy, không registry, không Swarm (xem [decisions-pending.md](./decisions-pending.md) #37).

---

## 1. Chuẩn bị một lần

| Ở đâu | Việc |
|---|---|
| Supabase | Tạo **project riêng cho staging** (không dùng chung dev). Bật JWT Signing Keys ES256, Google + Email provider |
| Sentry | Tạo project staging, lấy DSN (bỏ trống nếu chưa cần) |
| IP | Gắn Elastic IP / EIP để địa chỉ không đổi khi restart |
| EC2 / ECS | Ubuntu 22.04+, 2 vCPU / 4 GB (1 GB thì thêm swap 2 GB), đĩa ≥ 20 GB. Security group inbound: `22` (IP của bạn), `80`. **Không** mở 5432/6379 |

## 2. Cài trên server (một lần)

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git
sudo usermod -aG docker $USER && newgrp docker
git clone https://github.com/JasonEastar/nest-structure.git c9_backend
cd c9_backend
cp .env.example .env && nano .env
```

`.env` staging (khác dev ở các dòng này):

```
NODE_ENV=production
PUBLIC_URL=http://<ip-server>
POSTGRES_PASSWORD=<mật khẩu mạnh>
DATABASE_URL=postgres://c9:<mật khẩu mạnh>@postgres:5432/c9_map   # host = tên service trong compose
REDIS_URL=redis://redis:6379
SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… SUPABASE_SECRET_KEY=…      # project staging
SENTRY_DSN=…                                # hoặc để trống
```

## 3. Deploy (lần đầu và mỗi lần có code mới)

```bash
git pull
docker compose -f docker-compose.staging.yml up -d --build                # build image runtime, khởi động lại api-1, api-2
docker compose -f docker-compose.staging.yml run --rm api-1 node dist/migrate.js   # tạo bảng / migration mới
curl -s http://<ip-server>/health/ready
```

Admin đầu tiên (chưa ai có `role:assign`): đăng nhập Google một lần trên app staging (hoặc Supabase Dashboard → Users → Add user), rồi trên server:

```bash
docker compose -f docker-compose.staging.yml run --rm api-1 node scripts/grant-role.mjs you@gmail.com admin
```

## 4. Vận hành

| Việc | Lệnh |
|---|---|
| Xem log | `docker compose -f docker-compose.staging.yml logs -f api-1 api-2` (JSON, xoay 3 × 20 MB) |
| Trạng thái | `docker compose -f docker-compose.staging.yml ps` · `http://<ip-server>/health/ready` |
| Rollback | `git checkout <commit>` rồi chạy lại bước 3 (migration không tự lùi — viết migration mới) |
| Đổi `.env` | sửa file rồi `docker compose -f docker-compose.staging.yml up -d api-1 api-2` |
| Vào Postgres | `docker compose -f docker-compose.staging.yml exec postgres psql -U c9 c9_map` |
| Swagger / Bull Board | `/docs`, `/admin/queues?access_token=…` — đang mở trên staging, prod cân nhắc tắt `/docs` |

## 5. Chưa có (thêm khi lên prod)

- HTTPS: nginx đang chỉ `listen 80`. Khi có domain: cert vào nginx (certbot) hoặc đặt load balancer/Cloudflare có TLS phía trước rồi `TRUST_PROXY_HOPS=2`. Mobile iOS bắt buộc HTTPS ở bản phát hành.
- Backup Postgres (`pg_dump` cron → OBS) — quyết định #36.
- CI deploy (push image lên SWR, SSH `compose pull && up -d`) — khi có người thứ 2 deploy.
- 2 instance / Swarm — khi cần > 1 node, và phải đi cùng Postgres ngoài (RDS).
- Sentry `environment` đang lấy từ `NODE_ENV` → staging hiện là `production`; thêm biến riêng khi cần phân biệt.
