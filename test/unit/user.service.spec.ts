import type { SupabaseAdminPort } from '../../src/common/auth/supabase.js';
import type { CacheService } from '../../src/common/redis/cache.js';
import type { AdminUserRow } from '../../src/modules/user/dto/admin-user.dto.js';
import type { RoleCode } from '../../src/modules/user/dto/role.dto.js';
import type { UserRepository } from '../../src/modules/user/user.repository.js';
import { UserService } from '../../src/modules/user/user.service.js';

/**
 * Luật quyền của admin user mà integration không dựng được (chưa có role nào có user:create mà thiếu role:assign):
 * chặn leo thang khi tạo user, rollback Supabase khi Postgres lỗi, khoá admin cần role:assign.
 */
const ADMIN = '0199aaaa-0000-7000-8000-000000000001';
const TARGET = '0199aaaa-0000-7000-8000-000000000002';
const row = (id: string): AdminUserRow => ({
  id, email: `${id.slice(-2)}@c9map.test`, displayName: 'X', username: null, avatarUrl: null,
  status: 'active', statusReason: null, createdAt: new Date(Date.UTC(2026, 8, 20)),
});

function build(opts: { actorPerms: string[]; targetRoles?: RoleCode[]; insertFails?: boolean; supabaseDeleteFails?: boolean }) {
  const calls = { deleted: [] as string[], replaced: [] as RoleCode[][], status: [] as string[], cache: new Map<string, unknown>() };
  const repo = {
    findPermissionCodes: async () => opts.actorPerms,
    insertProfileIfMissing: async () => {
      if (opts.insertFails) throw new Error('db down');
      return { status: 'active' as const };
    },
    replaceUserRoles: async (_id: string, roles: RoleCode[]) => { calls.replaced.push(roles); },
    findAdminUser: async (id: string) => row(id),
    findRoleCodes: async (id: string) => (id === TARGET ? (opts.targetRoles ?? ['user']) : ['admin']),
    updateStatus: async (_id: string, status: string) => { calls.status.push(status); },
    deleteProfile: async () => {},
  } as unknown as UserRepository;
  const cache = {
    getJson: async () => null,
    setJson: async (k: string, v: unknown) => { calls.cache.set(k, v); },
    has: async () => false,
    flag: async (k: string) => { calls.cache.set(k, '1'); },
    del: async () => {},
  } as unknown as CacheService;
  const supabase: SupabaseAdminPort = {
    createUser: async () => ({ id: TARGET }),
    deleteUser: async (id) => {
      if (opts.supabaseDeleteFails) throw new Error('supabase down');
      calls.deleted.push(id);
    },
    getUserById: async () => null,
  };
  return { service: new UserService(repo, cache, supabase), calls };
}

describe('UserService.createUser', () => {
  it('roles ≠ user mà thiếu role:assign → FORBIDDEN missing role:assign, không gọi Supabase', async () => {
    const { service, calls } = build({ actorPerms: ['user:create'] });
    await expect(service.createUser(ADMIN, { email: 'a@c9map.test', password: 'x'.repeat(8), roles: ['moderator'] }))
      .rejects.toMatchObject({ code: 'FORBIDDEN', params: { missing: ['role:assign'] } });
    expect(calls.replaced).toEqual([]);
  });

  it('roles = [user] chỉ cần user:create; không replaceUserRoles (insertProfileIfMissing đã gán user)', async () => {
    const { service, calls } = build({ actorPerms: ['user:create'] });
    const created = await service.createUser(ADMIN, { email: 'a@c9map.test', password: 'x'.repeat(8), roles: ['user'] });
    expect(created.id).toBe(TARGET);
    expect(calls.replaced).toEqual([]);
  });

  it('Postgres lỗi sau khi Supabase đã tạo → xoá lại user Supabase rồi ném lỗi', async () => {
    const { service, calls } = build({ actorPerms: ['user:create', 'role:assign'], insertFails: true });
    await expect(service.createUser(ADMIN, { email: 'a@c9map.test', password: 'x'.repeat(8), roles: ['admin'] }))
      .rejects.toThrow('db down');
    expect(calls.deleted).toEqual([TARGET]);
  });
});

describe('UserService.setUserStatus', () => {
  it('khoá người có role admin cần role:assign; có thì khoá và ghi đè cache status', async () => {
    const denied = build({ actorPerms: ['user:ban'], targetRoles: ['admin'] });
    await expect(denied.service.setUserStatus(ADMIN, TARGET, { status: 'blocked' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN', params: { missing: ['role:assign'] } });
    expect(denied.calls.status).toEqual([]);

    const ok = build({ actorPerms: ['user:ban', 'role:assign'], targetRoles: ['admin'] });
    const result = await ok.service.setUserStatus(ADMIN, TARGET, { status: 'blocked', reason: 'rời công ty' });
    expect(result).toMatchObject({ status: 'blocked', statusReason: 'rời công ty' });
    expect(ok.calls.status).toEqual(['blocked']);
    expect([...ok.calls.cache.values()]).toContainEqual({ status: 'blocked' });
  });

  it('mở khoá xoá reason; tự khoá mình → FORBIDDEN CANNOT_BLOCK_SELF', async () => {
    const { service } = build({ actorPerms: ['user:ban'] });
    const result = await service.setUserStatus(ADMIN, TARGET, { status: 'active', reason: 'bỏ qua' });
    expect(result).toMatchObject({ status: 'active', statusReason: null });
    await expect(service.setUserStatus(ADMIN, ADMIN, { status: 'blocked' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN', params: { reason: 'CANNOT_BLOCK_SELF' } });
  });
});

describe('UserService.deleteMe', () => {
  it('Supabase deleteUser lỗi → INTERNAL (không lộ chi tiết), local đã xoá + tombstone đã cắm nên gọi lại an toàn', async () => {
    const { service, calls } = build({ actorPerms: [], supabaseDeleteFails: true });
    await expect(service.deleteMe(ADMIN)).rejects.toMatchObject({ code: 'INTERNAL' });
    expect([...calls.cache.keys()].some((k) => k.includes(':deleted:'))).toBe(true);
  });
});
