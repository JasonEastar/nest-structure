import type { SupabaseAdminPort } from '../../src/common/auth/supabase.js';
import type { CacheService } from '../../src/common/redis/cache.js';
import type { AdminUserRow } from '../../src/modules/user/dto/admin-user.dto.js';
import type { RoleCode } from '../../src/modules/user/dto/role.dto.js';
import type { RoleRepository } from '../../src/modules/user/repositories/role.repository.js';
import { PASSWORD_LENGTH } from '../../src/modules/user/user.constants.js';
import type { UserRepository } from '../../src/modules/user/repositories/user.repository.js';
import { UserService } from '../../src/modules/user/services/user.service.js';

/**
 * Luật của UserService mà integration không dựng được (chưa có role nào có user:create mà thiếu role:assign):
 * chặn leo thang khi tạo user, rollback Supabase khi Postgres lỗi, khoá admin cần role:assign, deleteMe khi Supabase lỗi.
 * Repository/cache/Supabase thay bằng object cùng interface (dependency double), không mock logic đang test.
 */
const ADMIN = '0199aaaa-0000-7000-8000-000000000001';
const TARGET = '0199aaaa-0000-7000-8000-000000000002';
const PASSWORD = 'x'.repeat(PASSWORD_LENGTH.min);

function row(id: string): AdminUserRow {
  return {
    id,
    email: `${id.slice(-2)}@c9map.test`,
    displayName: 'X',
    username: null,
    avatarUrl: null,
    status: 'active',
    statusReason: null,
    createdAt: new Date(Date.UTC(2026, 8, 20)),
  };
}

interface Options {
  actorPerms: string[];
  targetRoles?: RoleCode[];
  insertFails?: boolean;
  supabaseDeleteFails?: boolean;
}

/** Dựng service với các double; `calls` ghi lại những gì đã gọi để assert. */
function build(opts: Options) {
  const calls = {
    deleted: [] as string[],
    replaced: [] as RoleCode[][],
    status: [] as string[],
    cache: new Map<string, unknown>(),
  };

  const users = {
    insertProfileIfMissing: async () => {
      if (opts.insertFails) throw new Error('db down');
      return { status: 'active' as const };
    },
    findAdminUser: async (id: string) => row(id),
    updateStatus: async (_id: string, status: string) => {
      calls.status.push(status);
    },
    deleteProfile: async () => {},
  } as unknown as UserRepository;

  const roles = {
    findPermissionCodes: async () => opts.actorPerms,
    findRoleCodes: async (id: string) => (id === TARGET ? (opts.targetRoles ?? ['user']) : ['admin']),
    replaceUserRoles: async (_id: string, codes: RoleCode[]) => {
      calls.replaced.push(codes);
    },
  } as unknown as RoleRepository;

  const cache = {
    getJson: async () => null,
    setJson: async (key: string, value: unknown) => {
      calls.cache.set(key, value);
    },
    has: async () => false,
    flag: async (key: string) => {
      calls.cache.set(key, '1');
    },
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

  return { service: new UserService(users, roles, cache, supabase), calls };
}

describe('UserService.createUser', () => {
  it('roles ≠ user mà thiếu role:assign → FORBIDDEN missing role:assign, không gọi Supabase', async () => {
    const { service, calls } = build({ actorPerms: ['user:create'] });

    await expect(
      service.createUser(ADMIN, { email: 'a@c9map.test', password: PASSWORD, roles: ['moderator'] }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN', params: { missing: ['role:assign'] } });
    expect(calls.replaced).toEqual([]);
  });

  it('roles = [user] chỉ cần user:create; không replaceUserRoles (insertProfileIfMissing đã gán user)', async () => {
    const { service, calls } = build({ actorPerms: ['user:create'] });

    const created = await service.createUser(ADMIN, { email: 'a@c9map.test', password: PASSWORD, roles: ['user'] });

    expect(created.id).toBe(TARGET);
    expect(calls.replaced).toEqual([]);
  });

  it('Postgres lỗi sau khi Supabase đã tạo → xoá lại user Supabase rồi ném lỗi', async () => {
    const { service, calls } = build({ actorPerms: ['user:create', 'role:assign'], insertFails: true });

    await expect(
      service.createUser(ADMIN, { email: 'a@c9map.test', password: PASSWORD, roles: ['admin'] }),
    ).rejects.toThrow('db down');
    expect(calls.deleted).toEqual([TARGET]);
  });
});

describe('UserService.setUserStatus', () => {
  it('khoá người có role admin cần role:assign', async () => {
    const { service, calls } = build({ actorPerms: ['user:ban'], targetRoles: ['admin'] });

    await expect(service.setUserStatus(ADMIN, TARGET, { status: 'blocked' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      params: { missing: ['role:assign'] },
    });
    expect(calls.status).toEqual([]);
  });

  it('có role:assign → khoá, lưu reason, ghi đè cache status để guard chặn ngay', async () => {
    const { service, calls } = build({ actorPerms: ['user:ban', 'role:assign'], targetRoles: ['admin'] });

    const result = await service.setUserStatus(ADMIN, TARGET, { status: 'blocked', reason: 'rời công ty' });

    expect(result).toMatchObject({ status: 'blocked', statusReason: 'rời công ty' });
    expect(calls.status).toEqual(['blocked']);
    expect([...calls.cache.values()]).toContainEqual({ status: 'blocked' });
  });

  it('mở khoá xoá reason; tự khoá mình → FORBIDDEN CANNOT_BLOCK_SELF', async () => {
    const { service } = build({ actorPerms: ['user:ban'] });

    const result = await service.setUserStatus(ADMIN, TARGET, { status: 'active', reason: 'bỏ qua' });
    expect(result).toMatchObject({ status: 'active', statusReason: null });

    await expect(service.setUserStatus(ADMIN, ADMIN, { status: 'blocked' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
      params: { reason: 'CANNOT_BLOCK_SELF' },
    });
  });
});

describe('UserService.deleteMe', () => {
  it('Supabase deleteUser lỗi → INTERNAL (không lộ chi tiết); local đã xoá + tombstone đã cắm nên gọi lại an toàn', async () => {
    const { service, calls } = build({ actorPerms: [], supabaseDeleteFails: true });

    await expect(service.deleteMe(ADMIN)).rejects.toMatchObject({ code: 'INTERNAL' });
    expect([...calls.cache.keys()].some((key) => key.includes(':deleted:'))).toBe(true);
  });
});
