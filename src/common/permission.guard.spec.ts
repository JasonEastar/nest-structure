import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthUserPort } from './auth.guard.js';
import { RequirePermissions } from './decorators.js';
import { AppException } from './exceptions.js';
import { PermissionGuard } from './permission.guard.js';

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
  touchDevice: async () => {},
});

describe('PermissionGuard', () => {
  const reflector = new Reflector();

  it('route không khai @RequirePermissions → cho qua', async () => {
    const guard = new PermissionGuard(reflector, users([]));
    await expect(guard.canActivate(ctx(class {}, class {}, { id: 'u' }))).resolves.toBe(true);
  });

  it('metadata ở method đè class; thiếu quyền → FORBIDDEN kèm danh sách thiếu', async () => {
    @RequirePermissions(['role:manage'])
    class Ctl {
      @RequirePermissions(['report:review', 'user:ban'])
      handler() {}
    }
    const guard = new PermissionGuard(reflector, users(['report:review']));
    await expect(guard.canActivate(ctx(Ctl.prototype.handler, Ctl, { id: 'u' }))).rejects.toMatchObject({
      code: 'FORBIDDEN',
      params: { missing: ['user:ban'] },
    });
  });

  it('đủ quyền → true; không có req.user → UNAUTHENTICATED', async () => {
    @RequirePermissions(['queue:read'])
    class Ctl {
      handler() {}
    }
    await expect(
      new PermissionGuard(reflector, users(['queue:read'])).canActivate(ctx(Ctl.prototype.handler, Ctl, { id: 'u' })),
    ).resolves.toBe(true);
    await expect(
      new PermissionGuard(reflector, users(['queue:read'])).canActivate(ctx(Ctl.prototype.handler, Ctl)),
    ).rejects.toBeInstanceOf(AppException);
  });
});
