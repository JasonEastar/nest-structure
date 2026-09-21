import { readdirSync, readFileSync } from 'node:fs';
import { PERMISSION_CODES } from '../../src/common/auth/permissions.js';

/** Mọi mã trong permissions.ts phải được INSERT trong drizzle/*.sql (code và DB không lệch nhau). */
describe('PERMISSIONS ↔ seed SQL', () => {
  const sql = readdirSync('drizzle')
    .filter((f) => f.endsWith('.sql'))
    .map((f) => readFileSync(`drizzle/${f}`, 'utf8'))
    .join('\n');

  it.each(PERMISSION_CODES)('%s có trong migration', (code) => {
    expect(sql).toContain(`'${code}'`);
  });

  it('mã đúng dạng resource:action', () => {
    for (const code of PERMISSION_CODES) expect(code).toMatch(/^[a-z]+:[a-z_]+$/);
  });
});
