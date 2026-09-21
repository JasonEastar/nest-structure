#!/usr/bin/env node
/**
 * Kiểm chứng auth end-to-end với Supabase project THẬT (cần app đang chạy và .env đầy đủ):
 *   npm run dev  (cửa sổ khác)  →  node scripts/verify-auth.mjs [http://localhost:3000]
 * Tạo user tạm qua dev-token, gọi /me, admin API (403 → gán admin → 200), Bull Board, rồi DELETE /me.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { Redis } from 'ioredis';
import postgres from 'postgres';

if (existsSync('.env')) process.loadEnvFile('.env');
const base = process.argv[2] ?? `http://localhost:${process.env.PORT ?? 3000}`;

const jwks = await (await fetch(`${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`)).json();
console.log('JWKS:', jwks.keys.length ? jwks.keys.map((k) => `${k.kty}/${k.alg ?? '?'} kid=${k.kid}`).join(', ') : 'EMPTY');

const { userId, accessToken, email } = JSON.parse(execFileSync('node', ['scripts/dev-token.mjs', '--json'], { encoding: 'utf8' }));
const header = JSON.parse(Buffer.from(accessToken.split('.')[0], 'base64url').toString());
console.log(`token: alg=${header.alg} kid=${header.kid} user=${userId} ${email}`);

const call = async (method, path, extra = {}) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { authorization: `Bearer ${accessToken}`, 'x-device-id': 'dev-mac-001', ...extra },
  });
  const text = await res.text();
  return { status: res.status, body: text.slice(0, 220) };
};

let r = await call('GET', '/api/v1/me');
console.log(`GET /me → ${r.status} ${r.body}`);
r = await call('GET', '/api/v1/admin/roles');
console.log(`GET /admin/roles (user thường) → ${r.status}`);

const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
await sql`insert into user_roles (user_id, role_id) select ${userId}::uuid, id from roles where code = 'admin' on conflict do nothing`;
const devices = await sql`select device_id from devices where user_id = ${userId}::uuid`;
await sql.end();
console.log(`devices ghi từ x-device-id: ${devices.map((d) => d.device_id).join(', ') || '(chưa có)'}`);
// Gán role bằng SQL không đi qua admin API → tự xoá cache quyền (key khớp CACHE.perms trong src/common/redis/cache.ts).
const redisUrl = new URL(process.env.REDIS_URL);
const redis = new Redis({ host: redisUrl.hostname, port: Number(redisUrl.port || 6379), db: 0 });
await redis.del(`c9:v1:perms:${userId}`);
await redis.quit();
r = await call('GET', '/api/v1/me');
console.log(`GET /me sau khi gán admin trong DB → roles trong body: ${/"roles":\[[^\]]*\]/.exec(r.body)?.[0] ?? r.body}`);
r = await call('GET', '/admin/queues/api/queues');
console.log(`Bull Board (admin) → ${r.status}`);
r = await call('DELETE', '/api/v1/me');
console.log(`DELETE /me → ${r.status}`);
r = await call('GET', '/api/v1/me');
console.log(`GET /me sau xoá (token còn hạn) → ${r.status} ${r.body}`);
