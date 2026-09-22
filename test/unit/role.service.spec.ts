import type { CacheService } from '../../src/common/redis/cache.js';
import type { Role, RoleCode } from '../../src/modules/user/dto/role.dto.js';
import type { PermissionRepository } from '../../src/modules/user/repositories/permission.repository.js';
import type { RoleRepository } from '../../src/modules/user/repositories/role.repository.js';
import type { UserRepository } from '../../src/modules/user/repositories/user.repository.js';
import { RoleService } from '../../src/modules/user/services/role.service.js';

/**
 * Luật của RoleService với repository double: gán role (mã lạ → 422, xoá cache quyền), xoá role (hệ thống → 403,
 * đang gán → 409), sửa permission → xoá cache của mọi user mang role. SQL thật kiểm ở auth-rbac.spec.
 */
const USER = '0199aaaa-0000-7000-8000-000000000003';
const ROLE_ID = '0199bbbb-0000-7000-8000-000000000001';
const role = (over: Partial<Role> = {}): Role => ({
  id: ROLE_ID, code: 'editor', name: 'Biên tập', description: null, isSystem: false, permissions: ['pin:create'], ...over,
});

function build(opts: { exists?: boolean; role?: Role | null; usersWithRole?: string[] } = {}) {
  const calls = { replaced: [] as string[][], deletedKeys: [] as string[], deletedRoles: [] as string[], updated: [] as string[][] };
  const known: Record<string, string> = { user: 'id-user', admin: 'id-admin', editor: ROLE_ID };
  const roles = {
    findRoleIdsByCodes: async (codes: RoleCode[]) => new Map(codes.filter((c) => known[c]).map((c) => [c, known[c]!])),
    replaceUserRoles: async (_id: string, ids: string[]) => { calls.replaced.push(ids); },
    findRoleCodes: async () => ['editor'],
    findRoleById: async () => (opts.role === undefined ? role() : opts.role),
    countUsersWithRole: async () => (opts.usersWithRole ?? []).length,
    findUserIdsByRole: async () => opts.usersWithRole ?? [],
    deleteRole: async (id: string) => { calls.deletedRoles.push(id); },
    updateRole: async (_id: string, _input: unknown, permissionIds: string[]) => { calls.updated.push(permissionIds); },
  } as unknown as RoleRepository;
  const users = { profileExists: async () => opts.exists ?? true } as unknown as UserRepository;
  const knownPerms = ['pin:create', 'report:review'];
  const permissions = {
    findPermissionIdsByCodes: async (codes: string[]) => new Map(codes.filter((c) => knownPerms.includes(c)).map((c) => [c, `pid-${c}`])),
  } as unknown as PermissionRepository;
  const cache = { del: async (...keys: string[]) => { calls.deletedKeys.push(...keys); } } as unknown as CacheService;
  return { service: new RoleService(roles, permissions, users, cache), calls };
}

describe('RoleService.setUserRoles', () => {
  it('user không tồn tại → NOT_FOUND cho cả xem lẫn gán, không đụng DB', async () => {
    const { service, calls } = build({ exists: false });

    await expect(service.listUserRoles(USER)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service.setUserRoles(USER, ['admin'])).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(calls.replaced).toEqual([]);
  });

  it('mã role không có trong DB → VALIDATION_FAILED liệt kê mã lạ', async () => {
    const { service, calls } = build();

    await expect(service.setUserRoles(USER, ['editor', 'superuser'])).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      params: { issues: [{ path: 'roles', message: 'validation.role_not_found', args: { code: 'superuser' } }] }, // filter dịch theo Accept-Language
    });
    expect(calls.replaced).toEqual([]);
  });

  it('thay toàn bộ role theo id rồi xoá cache quyền của user đó', async () => {
    const { service, calls } = build();

    const result = await service.setUserRoles(USER, ['editor', 'admin']);

    expect(result).toEqual({ id: USER, roles: ['editor'] });
    expect(calls.replaced).toEqual([[ROLE_ID, 'id-admin']]);
    expect(calls.deletedKeys).toEqual([`c9:v1:user:perms:${USER}`]);
  });
});

describe('RoleService.removeRole / updateRole', () => {
  it('role hệ thống → FORBIDDEN (code); đang gán cho user → CONFLICT (count); rảnh → xoá', async () => {
    await expect(build({ role: role({ code: 'admin', isSystem: true }) }).service.removeRole(ROLE_ID)).rejects.toMatchObject({
      code: 'FORBIDDEN',
      params: { code: 'admin' },
    });
    await expect(build({ usersWithRole: [USER] }).service.removeRole(ROLE_ID)).rejects.toMatchObject({
      code: 'CONFLICT',
      params: { count: 1 },
    });
    const ok = build();
    await ok.service.removeRole(ROLE_ID);
    expect(ok.calls.deletedRoles).toEqual([ROLE_ID]);
  });

  it('không có role → NOT_FOUND; mã permission lạ → VALIDATION_FAILED', async () => {
    await expect(build({ role: null }).service.updateRole(ROLE_ID, { name: 'x', permissions: [] })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(build().service.updateRole(ROLE_ID, { name: 'x', permissions: ['nope:x'] })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      params: { issues: [{ path: 'permissions', message: 'validation.permission_not_found', args: { code: 'nope:x' } }] },
    });
  });

  it('đổi permission → xoá cache quyền của mọi user mang role; chỉ đổi tên → không xoá', async () => {
    const changed = build({ usersWithRole: [USER, 'u2'] });
    await changed.service.updateRole(ROLE_ID, { name: 'Biên tập viên', permissions: ['pin:create', 'report:review'] });
    expect(changed.calls.updated).toEqual([['pid-pin:create', 'pid-report:review']]);
    expect(changed.calls.deletedKeys).toEqual([`c9:v1:user:perms:${USER}`, 'c9:v1:user:perms:u2']);

    const renamed = build({ usersWithRole: [USER] });
    await renamed.service.updateRole(ROLE_ID, { name: 'Biên tập viên', permissions: ['pin:create'] });
    expect(renamed.calls.deletedKeys).toEqual([]);
  });
});
