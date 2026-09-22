import type { CacheService } from '../../src/common/redis/cache.js';
import type { RoleCode } from '../../src/modules/user/dto/role.dto.js';
import type { RoleRepository } from '../../src/modules/user/repositories/role.repository.js';
import { RoleService } from '../../src/modules/user/services/role.service.js';
import type { UserRepository } from '../../src/modules/user/repositories/user.repository.js';

/** RoleService.setUserRoles: user không có → NOT_FOUND; có → thay role và xoá cache quyền (hiệu lực ngay). */
const USER = '0199aaaa-0000-7000-8000-000000000003';

function build(exists: boolean) {
  const calls = { replaced: [] as RoleCode[][], deletedKeys: [] as string[] };
  const roles = {
    replaceUserRoles: async (_id: string, codes: RoleCode[]) => {
      calls.replaced.push(codes);
    },
    findRoleCodes: async () => calls.replaced.at(-1) ?? ['user'],
  } as unknown as RoleRepository;
  const users = { profileExists: async () => exists } as unknown as UserRepository;
  const cache = {
    del: async (...keys: string[]) => {
      calls.deletedKeys.push(...keys);
    },
  } as unknown as CacheService;
  return { service: new RoleService(roles, users, cache), calls };
}

describe('RoleService.setUserRoles', () => {
  it('user không tồn tại → NOT_FOUND cho cả xem lẫn gán, không đụng DB', async () => {
    const { service, calls } = build(false);

    await expect(service.listUserRoles(USER)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(service.setUserRoles(USER, ['admin'])).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(calls.replaced).toEqual([]);
  });

  it('thay toàn bộ role rồi xoá cache quyền của user đó', async () => {
    const { service, calls } = build(true);

    const result = await service.setUserRoles(USER, ['moderator', 'venue']);

    expect(result).toEqual({ id: USER, roles: ['moderator', 'venue'] });
    expect(calls.deletedKeys).toEqual([`c9:v1:user:perms:${USER}`]);
  });
});
