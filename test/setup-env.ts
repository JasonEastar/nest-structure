import { existsSync } from 'node:fs';

// Nạp .env cho test (giống main.ts). Biến đã có trong môi trường (CI) không bị ghi đè.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}
