#!/usr/bin/env node
/**
 * Lấy access_token thật từ Supabase project (dev/CI) mà không cần bấm qua Google.
 *   node scripts/dev-token.mjs [email]           → in access_token (mặc định user dev@c9map.test, dùng lại mỗi lần)
 *   node scripts/dev-token.mjs [email] --json    → in { userId, accessToken }
 *
 * Cách làm: admin.createUser (email_confirm) → admin.generateLink(magiclink) → verifyOtp(token_hash).
 * Cần SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY trong .env.
 */
import { existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

if (existsSync('.env')) process.loadEnvFile('.env');

const { SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || !SUPABASE_PUBLISHABLE_KEY) {
  console.error('Thiếu SUPABASE_URL / SUPABASE_SECRET_KEY / SUPABASE_PUBLISHABLE_KEY trong .env');
  process.exit(1);
}

// Mặc định MỘT user cố định để role đã gán (admin, queue:read…) giữ nguyên giữa các lần lấy token.
// Muốn user mới tinh: node scripts/dev-token.mjs someone@c9map.test
const email = process.argv[2]?.includes('@') ? process.argv[2] : 'dev@c9map.test';
const asJson = process.argv.includes('--json');

const admin = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const created = await admin.auth.admin.createUser({
  email,
  email_confirm: true,
  user_metadata: { full_name: 'Dev Tester', avatar_url: null },
});
if (created.error && created.error.status !== 422) throw created.error; // 422 = user đã tồn tại

const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
if (link.error) throw link.error;

const verified = await anon.auth.verifyOtp({
  token_hash: link.data.properties.hashed_token,
  type: 'magiclink',
});
if (verified.error) throw verified.error;

const accessToken = verified.data.session?.access_token;
const userId = verified.data.user?.id;
if (!accessToken || !userId) throw new Error('không lấy được session');

console.log(asJson ? JSON.stringify({ email, userId, accessToken }) : accessToken);
