#!/usr/bin/env bash
# Smoke đa instance trên Docker (docs/testing-and-ci.md §1): chạy sau `npm run dev:infra:full`.
#   npm run smoke                     # 6 kiểm tra, JWT SKIP nếu không có TOKEN
#   TOKEN=$(node scripts/dev-token.mjs) npm run smoke
# Kiểm: LB chia 2 instance · cache chung · rate limit chung · cron 1 lần/phút · JWT verify trên cả 2 · X-Request-Id echo.
set -uo pipefail

NGINX=${NGINX_URL:-http://localhost:${NGINX_HOST_PORT:-3000}}
API1=${API1_URL:-http://localhost:3001}
API2=${API2_URL:-http://localhost:3002}
PASS=0; FAIL=0; SKIP=0
ok()   { echo "PASS  $1"; PASS=$((PASS+1)); }
bad()  { echo "FAIL  $1 — $2"; FAIL=$((FAIL+1)); }
skip() { echo "SKIP  $1 — $2"; SKIP=$((SKIP+1)); }
hdr()  { curl -s -D - -o /dev/null "$@" | tr -d '\r' | awk -v k="$1" 'BEGIN{IGNORECASE=1} tolower($1)==tolower(k)":" {print $2}'; }

# 0. tiền đề: cả 2 instance sống, nginx không bị process khác chiếm port
for u in "$API1" "$API2" "$NGINX"; do
  curl -sf "$u/health/live" >/dev/null || { echo "ABORT: $u/health/live không trả 200 (chạy npm run dev:infra:full?)"; exit 2; }
done
ids=$(for i in $(seq 20); do curl -s -D - -o /dev/null "$NGINX/health/live" | tr -d '\r' | awk 'tolower($1)=="x-instance-id:"{print $2}'; done | sort -u | tr '\n' ' ')
case "$ids" in *api-1*api-2*|*api-2*api-1*) ok "1 load balancing: 20 request qua nginx đến cả api-1 và api-2 ($ids)";; *) bad "1 load balancing" "chỉ thấy: '$ids' (port 3000 bị process khác chiếm?)";; esac

# 2. cache chung: set qua redis-cli trong container, đọc qua /health? — không có endpoint cache public → kiểm qua Redis trực tiếp
if docker compose exec -T redis redis-cli set c9:smoke:shared 1 EX 30 >/dev/null 2>&1 \
   && [ "$(docker compose exec -T redis redis-cli get c9:smoke:shared 2>/dev/null | tr -d '\r')" = "1" ]; then
  ok "2 Redis dùng chung sẵn sàng (cache/throttle/queue cùng một Redis)"
else
  bad "2 Redis dùng chung" "không set/get được qua docker compose exec redis"
fi

# 3. rate limit chung qua 2 instance: /api/v1/me không token → 401 qua guard; sau THROTTLE_SHORT_LIMIT (10/s) → 429
codes=$(for i in $(seq 14); do curl -s -o /dev/null -w "%{http_code} " "$NGINX/api/v1/me" & done; wait)   # song song: chắc chắn nằm trong cửa sổ 1 s
if echo "$codes" | grep -q 429; then ok "3 rate limit đếm chung: $codes"; else bad "3 rate limit đếm chung" "không thấy 429: $codes"; fi
retry=$(hdr Retry-After "$NGINX/api/v1/me")
[ -n "$retry" ] && ok "3b Retry-After=$retry giây" || bad "3b Retry-After" "thiếu header"
sleep 1.2

# 4. cron 1 lần/phút, không nhân đôi: đếm 'expire tick' trong 70 s trên cả 2 container
echo "      (chờ 70 s để đếm expire tick trên 2 container…)"
sleep 70
ticks=$(docker compose --profile full logs --no-color --since 75s api-1 api-2 2>/dev/null | grep -c "expire tick" || true)
if [ "$ticks" -ge 1 ] && [ "$ticks" -le 2 ]; then ok "4 cron: $ticks tick trong 70 s (1/phút, không nhân theo replica)"; else bad "4 cron" "$ticks tick trong 70 s"; fi

# 5. JWT verify trên cả 2 instance (JWKS cache độc lập mỗi instance)
if [ -n "${TOKEN:-}" ]; then
  c1=$(curl -s -o /dev/null -w "%{http_code}" -H "authorization: Bearer $TOKEN" "$API1/api/v1/me")
  c2=$(curl -s -o /dev/null -w "%{http_code}" -H "authorization: Bearer $TOKEN" "$API2/api/v1/me")
  [ "$c1" = 200 ] && [ "$c2" = 200 ] && ok "5 JWT verify: api-1=$c1 api-2=$c2" || bad "5 JWT verify" "api-1=$c1 api-2=$c2"
else
  skip "5 JWT verify" "đặt TOKEN=\$(node scripts/dev-token.mjs)"
fi

# 6. X-Request-Id: nginx sinh và app echo; client gửi → giữ nguyên
rid=$(hdr X-Request-Id "$NGINX/health/live")
echoed=$(hdr X-Request-Id -H "X-Request-Id: smoke-abc-12345" "$NGINX/health/live")
if [ -n "$rid" ] && [ "$echoed" = "smoke-abc-12345" ]; then ok "6 X-Request-Id: nginx sinh ($rid), client gửi được giữ"; else bad "6 X-Request-Id" "sinh='$rid' echo='$echoed'"; fi

echo "----"; echo "PASS=$PASS FAIL=$FAIL SKIP=$SKIP"
[ "$FAIL" -eq 0 ]
