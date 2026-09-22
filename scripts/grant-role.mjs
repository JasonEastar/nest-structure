#!/usr/bin/env node
/**
 * Gán role cho một user bằng email — dùng cho admin ĐẦU TIÊN (chưa ai có role:assign để gọi PUT /admin/users/:id/roles).
 *   node scripts/grant-role.mjs <email> admin              → thay toàn bộ role của user thành [admin]
 *   node scripts/grant-role.mjs <email> admin,moderator    → nhiều role
 * User phải tồn tại trong Supabase (Dashboard → Users → Add user, hoặc đã đăng nhập Google). Chưa có profile → tạo.
 * Cần DATABASE_URL, REDIS_URL, SUPABASE_URL, SUPABASE_SECRET_KEY trong .env.
 */
import { existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { Redis } from 'ioredis';
import postgres from 'postgres';

if (existsSync('.env')) process.loadEnvFile('.env');
const [email, rolesArg] = process.argv.slice(2);
if (!email?.includes('@') || !rolesArg) {
  console.error('Cách dùng: node scripts/grant-role.mjs <email> <role[,role]>');
  process.exit(1);
}
const codes = rolesArg.split(',').map((r) => r.trim()).filter(Boolean);

// 1. Tìm user trên Supabase theo email (Admin API không lọc theo email → duyệt trang)
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
let user = null;
for (let page = 1; !user; page++) {
  const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
  if (error) throw error;
  user = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) ?? null;
  if (data.users.length < 200) break;
}
if (!user) {
  console.error(`Không có user ${email} trên Supabase. Tạo ở Dashboard → Authentication → Users → Add user rồi chạy lại.`);
  process.exit(1);
}

// 2. Profile (nếu chưa) + thay toàn bộ role trong một transaction
const sql = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
await sql.begin(async (tx) => {
  await tx`insert into profiles (id, email, display_name) values (${user.id}::uuid, ${email}, ${email.split('@')[0]}) on conflict (id) do nothing`;
  const roles = await tx`select id, code from roles where code = any(${codes})`;
  const missing = codes.filter((c) => !roles.some((r) => r.code === c));
  if (missing.length) throw new Error(`Role không tồn tại: ${missing.join(', ')}`);
  await tx`delete from user_roles where user_id = ${user.id}::uuid`;
  await tx`insert into user_roles (user_id, role_id) select ${user.id}::uuid, id from roles where code = any(${codes})`;
});
await sql.end();

// 3. Xoá cache quyền để hiệu lực ngay (API gán role tự làm việc này). Key phải khớp USER_CACHE.perms trong src/modules/user/user.constants.ts
const redisUrl = new URL(process.env.REDIS_URL);
const redis = new Redis({ host: redisUrl.hostname, port: Number(redisUrl.port || 6379), db: 0 });
await redis.del(`c9:v1:user:perms:${user.id}`);
await redis.quit();
console.log(`${email} (${user.id}) → roles: ${codes.join(', ')}`);
