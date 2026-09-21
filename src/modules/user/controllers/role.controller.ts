import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { RequirePermission } from '../../../common/auth/decorators.js';
import { envelope } from '../../../config/openapi.js';
import { RoleSchema, type SetUserRoles, SetUserRolesSchema, UserRolesSchema } from '../dto/role.dto.js';
import { RoleService } from '../services/role.service.js';

/** Quản trị role — /api/v1/admin/roles, /api/v1/admin/users/:id/roles. Tag Swagger riêng "Roles". */
@ApiTags('Roles')
@ApiBearerAuth('supabase')
@Controller('admin')
@RequirePermission('role:read')
export class RoleController {
  constructor(private readonly roles: RoleService) {}

  @Get('roles')
  @ApiOperation({ summary: 'Danh sách role', description: 'Mỗi role kèm danh sách permission (resource:action) được gán.' })
  @ApiOkResponse({ standardSchema: envelope(z.array(RoleSchema)) })
  listRoles() {
    return this.roles.listRoles();
  }

  @Get('users/:id/roles')
  @ApiOperation({ summary: 'Role hiện tại của một user' })
  @ApiOkResponse({ standardSchema: envelope(UserRolesSchema) })
  async getUserRoles(@Param('id', { schema: z.uuid() }) id: string) {
    return { id, roles: await this.roles.listUserRoles(id) };
  }

  @Put('users/:id/roles')
  @RequirePermission('role:assign')
  @ApiOperation({
    summary: 'Gán lại role cho user',
    description: 'Thay toàn bộ role bằng mảng gửi lên (một user có thể nhiều role). Hiệu lực ngay trên mọi instance vì cache permission của user bị xoá.',
  })
  @ApiOkResponse({ standardSchema: envelope(UserRolesSchema) })
  setUserRoles(@Param('id', { schema: z.uuid() }) id: string, @Body({ schema: SetUserRolesSchema }) body: SetUserRoles) {
    return this.roles.setUserRoles(id, body.roles);
  }
}
