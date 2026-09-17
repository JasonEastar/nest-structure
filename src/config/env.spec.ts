import { envSchema, loadEnv } from './env.js';

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
    expect(env.DB_POOL_MAX).toBe(10);
    expect(env.REDIS_QUEUE_DB).toBe(1);
    expect(env.THROTTLE_SHORT_LIMIT).toBe(10);
    expect(env.INSTANCE_ID.length).toBeGreaterThan(0);
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
    expect(() => loadEnv({ ...base, LOG_LEVEL: 'loud' })).toThrow(/LOG_LEVEL/);
    expect(() => loadEnv({ ...base, TRUST_PROXY_HOPS: '9' })).toThrow(/TRUST_PROXY_HOPS/);
  });

  it('envSchema là Standard Schema (dùng được cho ConfigModule.validationSchema)', () => {
    expect((envSchema as unknown as { '~standard': { vendor: string } })['~standard'].vendor).toBe('zod');
  });
});
