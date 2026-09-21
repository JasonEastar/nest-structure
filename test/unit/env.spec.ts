import { envSchema } from '../../src/config/env.js';

/** Thay cho ConfigModule trong unit test: parse như Nest sẽ làm lúc boot. */
const loadEnv = (source: Record<string, string>) => {
  const r = envSchema.safeParse(source);
  if (!r.success) throw new Error(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n'));
  return r.data;
};

const base = {
  DATABASE_URL: 'postgres://c9:c9@127.0.0.1:5432/c9_map',
  REDIS_URL: 'redis://127.0.0.1:6379',
  SUPABASE_URL: 'https://abc.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_0123456789abcdefghij',
};

describe('config/env', () => {
  it('áp mặc định và coerce số', () => {
    const env = loadEnv({ ...base });
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(loadEnv({ ...base, PORT: '8080' }).PORT).toBe(8080);
  });

  it('thiếu biến bắt buộc → lỗi liệt kê đúng tên biến', () => {
    expect(() => loadEnv({})).toThrow(/DATABASE_URL/);
    expect(() => loadEnv({})).toThrow(/REDIS_URL/);
    expect(() => loadEnv({})).toThrow(/SUPABASE_SECRET_KEY/);
  });

  it('giá trị sai kiểu/protocol bị từ chối', () => {
    expect(() => loadEnv({ ...base, PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadEnv({ ...base, DATABASE_URL: 'mysql://x' })).toThrow(/DATABASE_URL/);
    expect(() => loadEnv({ ...base, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
    expect(() => loadEnv({ ...base, SUPABASE_URL: 'ftp://x' })).toThrow(/SUPABASE_URL/);
  });

  it('envSchema là Standard Schema (dùng được cho ConfigModule.validationSchema)', () => {
    expect((envSchema as unknown as { '~standard': { vendor: string } })['~standard'].vendor).toBe('zod');
  });
});
