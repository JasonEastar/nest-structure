import { existsSync } from 'node:fs';

/**
 * Nạp `.env` vào process.env — PHẢI chạy trước khi `app.module.ts` được import.
 * Lý do: `ConfigModule.forRoot()` chụp `process.env` ngay lúc `@Module` được evaluate, mà ESM hoisting
 * đưa mọi `import` lên trước code trong `main.ts`. Vì vậy file này là một side-effect module và
 * `main.ts` import nó ở DÒNG ĐẦU TIÊN (thứ tự import trong ESM được giữ nguyên).
 * Biến đã có sẵn trong môi trường (docker-compose, CI) KHÔNG bị ghi đè.
 */
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}
