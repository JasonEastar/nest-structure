import { existsSync } from 'node:fs';

/**
 * Nạp `.env` vào process.env. main.ts import file này ở DÒNG ĐẦU vì ConfigModule chụp process.env ngay khi
 * app.module được import (ESM hoisting). Biến đã có trong môi trường (compose, CI) không bị ghi đè.
 */
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}
