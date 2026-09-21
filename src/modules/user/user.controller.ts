import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth.guard.js';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators.js';
import { envelope } from '../../config/openapi.js';
import {
  AdminUserSchema,
  type CreateUser,
  CreateUserSchema,
  type ListUsersQuery,
  ListUsersQuerySchema,
  type SetUserStatus,
  SetUserStatusSchema,
} from './dto/admin-user.dto.js';
import { MeResponseSchema } from './dto/me.dto.js';
import { RoleSchema, type SetUserRoles, SetUserRolesSchema, UserRolesSchema } from './dto/role.dto.js';
import { type UpdateMe, UpdateMeSchema } from './dto/update-me.dto.js';
import { UserService } from './user.service.js';

/** Route của module user: (1) /me hồ sơ của user đang đăng nhập, (2) /admin/users quản trị user, (3) /admin/roles quản trị role. */

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

  @Patch()
  @ApiOperation({
    summary: 'Sửa hồ sơ của tôi',
    description:
      'Gửi field nào sửa field đó (`displayName`, `avatarUrl`, `locale`, `homeCityCode`); `null` để xoá. `username` là định danh đăng nhập, không sửa qua đây.',
  })
  @ApiOkResponse({ standardSchema: envelope(MeResponseSchema) })
  updateMe(@CurrentUser() user: AuthUser, @Body({ schema: UpdateMeSchema }) body: UpdateMe) {
    return this.users.updateMe(user.id, body);
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
// 2. Quản trị user — /api/v1/admin/users (mỗi route một permission; Swagger tự ghi "Quyền cần có" từ @RequirePermission)
// ---------------------------------------------------------------------------------------------------------------------
@ApiTags('Users')
@ApiBearerAuth('supabase')
@Controller('admin/users')
export class UserAdminController {
  constructor(private readonly users: UserService) {}

  @Post()
  @RequirePermission('user:create')
  @ApiOperation({
    summary: 'Tạo tài khoản email + mật khẩu',
    description:
      'Cho nhân sự (admin, moderator, venue...); user app vẫn đăng nhập Google. Supabase giữ mật khẩu, email đã xác nhận sẵn, '
      + '`app_metadata.must_change_password = true` để admin web ép đổi mật khẩu lần đầu. `roles` khác `user` cần thêm quyền `role:assign`. '
      + 'Email đã có → 409 `CONFLICT` (`EMAIL_TAKEN`); mật khẩu không đạt policy Supabase → 422.',
  })
  @ApiCreatedResponse({ standardSchema: envelope(AdminUserSchema) })
  createUser(@CurrentUser() actor: AuthUser, @Body({ schema: CreateUserSchema }) body: CreateUser) {
    return this.users.createUser(actor.id, body);
  }

  @Get()
  @RequirePermission('user:read')
  @ApiOperation({ summary: 'Danh sách user', description: 'Mới nhất trước, cursor. `q` tìm theo email hoặc tên.' })
  @ApiOkResponse({ standardSchema: envelope(z.array(AdminUserSchema)) })
  listUsers(@Query({ schema: ListUsersQuerySchema }) query: ListUsersQuery) {
    return this.users.listUsers(query);
  }

  @Get(':id')
  @RequirePermission('user:read')
  @ApiOperation({ summary: 'Chi tiết một user' })
  @ApiOkResponse({ standardSchema: envelope(AdminUserSchema) })
  getUser(@Param('id', { schema: z.uuid() }) id: string) {
    return this.users.getUser(id);
  }

  @Patch(':id/status')
  @RequirePermission('user:ban')
  @ApiOperation({
    summary: 'Khoá / mở khoá user',
    description:
      '`blocked`: mọi request của user đó bị 403 `FORBIDDEN` (`ACCOUNT_BLOCKED`) ngay trên mọi instance. '
      + 'Không tự khoá mình; khoá người có role `admin` cần thêm `role:assign`.',
  })
  @ApiOkResponse({ standardSchema: envelope(AdminUserSchema) })
  setUserStatus(
    @CurrentUser() actor: AuthUser,
    @Param('id', { schema: z.uuid() }) id: string,
    @Body({ schema: SetUserStatusSchema }) body: SetUserStatus,
  ) {
    return this.users.setUserStatus(actor.id, id, body);
  }

}

// ---------------------------------------------------------------------------------------------------------------------
// 3. Quản trị role — /api/v1/admin/roles, /api/v1/admin/users/:id/roles (tách class để Swagger không gộp vào tag Users)
// ---------------------------------------------------------------------------------------------------------------------
@ApiTags('Roles')
@ApiBearerAuth('supabase')
@Controller('admin')
@RequirePermission('role:read')
export class RoleAdminController {
  constructor(private readonly users: UserService) {}

  @Get('roles')
  @ApiOperation({ summary: 'Danh sách role', description: 'Mỗi role kèm danh sách permission (resource:action) được gán.' })
  @ApiOkResponse({ standardSchema: envelope(z.array(RoleSchema)) })
  listRoles() {
    return this.users.listRoles();
  }

  @Get('users/:id/roles')
  @ApiOperation({ summary: 'Role hiện tại của một user' })
  @ApiOkResponse({ standardSchema: envelope(UserRolesSchema) })
  async getUserRoles(@Param('id', { schema: z.uuid() }) id: string) {
    return { id, roles: await this.users.listUserRoles(id) };
  }

  @Put('users/:id/roles')
  @RequirePermission('role:assign')
  @ApiOperation({
    summary: 'Gán lại role cho user',
    description: 'Thay toàn bộ role bằng mảng gửi lên (một user có thể nhiều role). Hiệu lực ngay trên mọi instance vì cache permission của user bị xoá.',
  })
  @ApiOkResponse({ standardSchema: envelope(UserRolesSchema) })
  setUserRoles(@Param('id', { schema: z.uuid() }) id: string, @Body({ schema: SetUserRolesSchema }) body: SetUserRoles) {
    return this.users.setUserRoles(id, body.roles);
  }
}
