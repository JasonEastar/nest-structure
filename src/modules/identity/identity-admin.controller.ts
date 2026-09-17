import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { RequirePermissions } from '../../common/decorators.js';
import { zodResponse } from '../../common/openapi.js';
import { RoleSchema, type SetUserRoles, SetUserRolesSchema } from './identity.dto.js';
import { IdentityService } from './identity.service.js';

/** API quản trị — chỉ xuất hiện trong /docs/admin, cần permission `role:manage`. */
@ApiTags('admin: roles')
@ApiBearerAuth('supabase')
@Controller('admin')
@RequirePermissions(['role:manage'])
export class IdentityAdminController {
  constructor(private readonly identity: IdentityService) {}

  @Get('roles')
  @ApiOperation({ summary: 'Danh sách role và permission kèm theo' })
  @ApiOkResponse({ schema: zodResponse(z.array(RoleSchema), true) })
  listRoles() {
    return this.identity.listRoles();
  }

  @Get('users/:id/roles')
  @ApiOperation({ summary: 'Role hiện tại của một user' })
  async getUserRoles(@Param('id', { schema: z.uuid() }) id: string) {
    return { id, roles: await this.identity.listUserRoles(id) };
  }

  @Put('users/:id/roles')
  @ApiOperation({ summary: 'Gán lại role cho user (hiệu lực ngay, cache quyền bị xoá)' })
  setUserRoles(@Param('id', { schema: z.uuid() }) id: string, @Body({ schema: SetUserRolesSchema }) body: SetUserRoles) {
    return this.identity.setUserRoles(id, body.roles);
  }
}
