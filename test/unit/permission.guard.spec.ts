import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUserPort } from '../../src/common/auth/auth.guard.js';
import { RequirePermission } from '../../src/common/auth/decorators.js';
import { AppException } from '../../src/common/http/exceptions.js';
import { PermissionGuard } from '../../src/common/auth/permission.guard.js';

function ctx(handler: object, cls: object, user?: { id: string }): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => cls,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

const users = (granted: string[]): AuthUserPort => ({
  ensureProfile: async () => ({ id: 'u' }),
  getPermissions: async () => granted,
});

describe('PermissionGuard', () => {
  const reflector = new Reflector();

  it('route không khai @RequirePermission → cho qua', async () => {
    const guard = new PermissionGuard(reflector, users([]));
    await expect(guard.canActivate(ctx(class {}, class {}, { id: 'u' }))).resolves.toBe(true);
  });

  it('metadata ở method đè class; thiếu quyền → FORBIDDEN kèm danh sách thiếu', async () => {
    @RequirePermission('role:assign')
    class Ctl {
      @RequirePermission('report:review', 'user:ban')
      handler() {}
    }
    const guard = new PermissionGuard(reflector, users(['report:review']));
    await expect(guard.canActivate(ctx(Ctl.prototype.handler, Ctl, { id: 'u' }))).rejects.toMatchObject({
      code: 'FORBIDDEN',
      params: { missing: ['user:ban'] },
    });
  });

  it('đủ quyền → true; không có req.user → UNAUTHENTICATED', async () => {
    @RequirePermission('pin:create')
    class Ctl {
      handler() {}
    }
    await expect(
      new PermissionGuard(reflector, users(['pin:create'])).canActivate(ctx(Ctl.prototype.handler, Ctl, { id: 'u' })),
    ).resolves.toBe(true);
    await expect(
      new PermissionGuard(reflector, users(['pin:create'])).canActivate(ctx(Ctl.prototype.handler, Ctl)),
    ).rejects.toBeInstanceOf(AppException);
  });
});
