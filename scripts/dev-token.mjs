#!/usr/bin/env node
/**
 * Tạo (hoặc dùng lại) một user dev trên Supabase, gán role trong Postgres, rồi in access_token thật — khỏi bấm qua Google.
 * Mặc định role `admin` (có MỌI permission theo code) để gọi được cả /admin/*.
 *   node scripts/dev-token.mjs                              → user mặc định, role admin, in token
 *   node scripts/dev-token.mjs an@c9map.test                → user khác, role admin
 *   node scripts/dev-token.mjs an@c9map.test --roles user   → role thường (để thử 403)
 *   node scripts/dev-token.mjs --json                       → { email, userId, roles, accessToken }
 * Chỉ token ra stdout nên `TOKEN=$(node scripts/dev-token.mjs)` vẫn sạch; dòng tóm tắt ra stderr.
 *
 * Token lấy bằng: admin.createUser (email_confirm) → admin.generateLink(magiclink) → verifyOtp.
 * Cần SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY, DATABASE_URL, REDIS_URL trong .env.
 */
import { existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { Redis } from 'ioredis';
import postgres from 'postgres';

if (existsSync('.env')) process.loadEnvFile('.env');

const { SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY, DATABASE_URL, REDIS_URL } = process.env;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || !SUPABASE_PUBLISHABLE_KEY || !DATABASE_URL || !REDIS_URL) {
  console.error('Thiếu SUPABASE_URL / SUPABASE_SECRET_KEY / SUPABASE_PUBLISHABLE_KEY / DATABASE_URL / REDIS_URL trong .env');
  process.exit(1);
}

const args = process.argv.slice(2);
// Mặc định MỘT user cố định để token lấy lần sau vẫn là người cũ; muốn user mới: truyền email khác
const email = args.find((a) => a.includes('@')) ?? 'chris@gmail.com';
const rolesFlag = args.indexOf('--roles');
const roles = (rolesFlag >= 0 ? (args[rolesFlag + 1] ?? '') : 'admin').split(',').map((r) => r.trim()).filter(Boolean);
if (!roles.length) {
  console.error('Cách dùng: node scripts/dev-token.mjs [email] [--roles admin,moderator] [--json]');
  process.exit(1);
}
const asJson = args.includes('--json');

const sql = postgres(DATABASE_URL, { max: 1, onnotice: () => {} });
const fail = async (message) => {
  console.error(message);
  await sql.end();
  process.exit(1);
};

// 1. Role phải có trong DB — kiểm trước để không tạo user Supabase thừa khi gõ sai
const known = await sql`select code from roles where code = any(${roles})`;
const missing = roles.filter((code) => !known.some((r) => r.code === code));
if (missing.length) await fail(`Role không có trong DB: ${missing.join(', ')}`);

// 2. Tài khoản Supabase + access_token thật
const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const created = await admin.auth.admin.createUser({
  email,
  email_confirm: true,
  user_metadata: { full_name: 'Dev Tester', avatar_url: null },
});
if (created.error && created.error.status !== 422) throw created.error; // 422 = user đã tồn tại

const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
if (link.error) throw link.error;

const verified = await anon.auth.verifyOtp({ token_hash: link.data.properties.hashed_token, type: 'magiclink' });
if (verified.error) throw verified.error;

const accessToken = verified.data.session?.access_token;
const userId = verified.data.user?.id;
if (!accessToken || !userId) throw new Error('không lấy được session');

// 3. Profile (guard vẫn tạo lười, nhưng gán role thì cần row sẵn) + thay toàn bộ role
const permissionCount = await sql.begin(async (tx) => {
  await tx`insert into profiles (id, email, display_name) values (${userId}::uuid, ${email}, ${email.split('@')[0]})
           on conflict (id) do nothing`;
  await tx`delete from user_roles where user_id = ${userId}::uuid`;
  await tx`insert into user_roles (user_id, role_id) select ${userId}::uuid, id from roles where code = any(${roles})`;
  // role admin = mọi permission trong bảng (luật ở role.repository.ts), không cần gán role_permissions
  const [row] = roles.includes('admin')
    ? await tx`select count(*)::int as n from permissions`
    : await tx`select count(distinct p.code)::int as n from user_roles ur
               join role_permissions rp on rp.role_id = ur.role_id
               join permissions p on p.id = rp.permission_id
               where ur.user_id = ${userId}::uuid`;
  return row.n;
});
await sql.end();

// 4. Xoá cache để role mới hiệu lực ngay (key khớp USER_CACHE trong src/modules/user/user.constants.ts)
const redisUrl = new URL(REDIS_URL);
const redis = new Redis({ host: redisUrl.hostname, port: Number(redisUrl.port || 6379), db: 0 });
await redis.del(`c9:v1:user:perms:${userId}`, `c9:v1:user:${userId}`, `c9:v1:user:deleted:${userId}`);
await redis.quit();

if (asJson) {
  console.log(JSON.stringify({ email, userId, roles, accessToken }));
} else {
  console.error(`${email} (${userId}) → roles: ${roles.join(', ')} · ${permissionCount} permission`);
  console.log(accessToken);
}
