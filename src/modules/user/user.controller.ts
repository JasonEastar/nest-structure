import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth.guard.js';
import { CurrentUser, RequirePermissions } from '../../common/auth/decorators.js';
import { envelope } from '../../config/openapi.js';
import { MeResponseSchema } from './dto/me.dto.js';
import { RoleSchema, type SetUserRoles, SetUserRolesSchema } from './dto/role.dto.js';
import { UserService } from './user.service.js';

/** Route của module user: (1) /me hồ sơ của user đang đăng nhập, (2) /admin/... quản trị role, cần permission. */

// ---------------------------------------------------------------------------------------------------------------------
// 1. Hồ sơ của tôi — /api/v1/me
// ---------------------------------------------------------------------------------------------------------------------
@ApiTags('Me')
@ApiBearerAuth('supabase')
@Controller('me')
export class UserController {
  constructor(private readonly users: UserService) {}

  @Get()
  @ApiOperation({
    summary: 'Hồ sơ của tôi',
    description: 'Profile được tạo tự động ở request đầu tiên sau khi đăng nhập Google (Supabase). Kèm role và permission hiệu lực.',
  })
  @ApiOkResponse({ standardSchema: envelope(MeResponseSchema) })
  me(@CurrentUser() user: AuthUser) {
    return this.users.getMe(user.id);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Xoá tài khoản',
    description: 'Xoá dữ liệu local (cascade) rồi xoá user trên Supabase. Token còn hạn sau đó vẫn bị từ chối (tombstone 1 giờ).',
  })
  async deleteMe(@CurrentUser() user: AuthUser): Promise<void> {
    await this.users.deleteMe(user.id);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// 2. Quản trị role — /api/v1/admin (cần permission role:manage; Swagger tự ghi "Quyền cần có" từ @RequirePermissions)
// ---------------------------------------------------------------------------------------------------------------------
@ApiTags('Roles')
@ApiBearerAuth('supabase')
@Controller('admin')
@RequirePermissions(['role:manage'])
export class UserAdminController {
  constructor(private readonly users: UserService) {}

  @Get('roles')
  @ApiOperation({ summary: 'Danh sách role', description: 'Mỗi role kèm danh sách permission (resource:action) được gán.' })
  @ApiOkResponse({ standardSchema: envelope(z.array(RoleSchema)) })
  listRoles() {
    return this.users.listRoles();
  }

  @Get('users/:id/roles')
  @ApiOperation({ summary: 'Role hiện tại của một user' })
  async getUserRoles(@Param('id', { schema: z.uuid() }) id: string) {
    return { id, roles: await this.users.listUserRoles(id) };
  }

  @Put('users/:id/roles')
  @ApiOperation({
    summary: 'Gán lại role cho user',
    description: 'Thay toàn bộ role. Hiệu lực ngay trên mọi instance vì cache permission của user bị xoá.',
  })
  setUserRoles(@Param('id', { schema: z.uuid() }) id: string, @Body({ schema: SetUserRolesSchema }) body: SetUserRoles) {
    return this.users.setUserRoles(id, body.roles);
  }
}
