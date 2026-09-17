import '../src/config/load-env.js';

// Vitest setupFiles chạy trước khi test file import AppModule → ConfigModule thấy đủ biến.
// Test muốn ghi đè biến (vd SUPABASE_JWKS_URL trỏ JWKS server nội bộ) phải set process.env
// RỒI mới `await import('../src/app.module.js')` — vì ConfigModule chụp process.env lúc module được import.
