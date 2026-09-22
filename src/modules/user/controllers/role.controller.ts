import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { RequirePermission } from '../../../common/auth/decorators.js';
import { envelope } from '../../../config/openapi.js';
import {
  type CreateRole,
  CreateRoleSchema,
  RoleSchema,
  type SetUserRoles,
  SetUserRolesSchema,
  type UpdateRole,
  UpdateRoleSchema,
  UserRolesSchema,
} from '../dto/role.dto.js';
import { RoleService } from '../services/role.service.js';

/** Quản trị role — /admin/roles (CRUD role + permission của role), /admin/users/:id/roles. Tag Swagger "Roles"; permission/nhóm: permission.controller.ts. */
@ApiTags('Roles')
@ApiBearerAuth('supabase')
@Controller('admin')
export class RoleController {
  constructor(private readonly roles: RoleService) {}

  @Get('roles')
  @RequirePermission('role:read')
  @ApiOperation({ summary: 'Danh sách role' })
  @ApiOkResponse({ standardSchema: envelope(z.array(RoleSchema)) })
  listRoles() {
    return this.roles.listRoles();
  }

  @Post('roles')
  @RequirePermission('role:create')
  @ApiOperation({ summary: 'Tạo role' })
  @ApiCreatedResponse({ standardSchema: envelope(RoleSchema) })
  createRole(@Body({ schema: CreateRoleSchema }) body: CreateRole) {
    return this.roles.createRole(body);
  }

  @Put('roles/:id')
  @RequirePermission('role:update')
  @ApiOperation({ summary: 'Sửa role' })
  @ApiOkResponse({ standardSchema: envelope(RoleSchema) })
  updateRole(@Param('id', { schema: z.uuid() }) id: string, @Body({ schema: UpdateRoleSchema }) body: UpdateRole) {
    return this.roles.updateRole(id, body);
  }

  @Delete('roles/:id')
  @RequirePermission('role:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xoá role' })
  async removeRole(@Param('id', { schema: z.uuid() }) id: string): Promise<void> {
    await this.roles.removeRole(id);
  }

  @Get('users/:id/roles')
  @RequirePermission('role:read')
  @ApiOperation({ summary: 'Role hiện tại của một user' })
  @ApiOkResponse({ standardSchema: envelope(UserRolesSchema) })
  async getUserRoles(@Param('id', { schema: z.uuid() }) id: string) {
    return { id, roles: await this.roles.listUserRoles(id) };
  }

  @Put('users/:id/roles')
  @RequirePermission('role:assign')
  @ApiOperation({ summary: 'Gán lại role cho user' })
  @ApiOkResponse({ standardSchema: envelope(UserRolesSchema) })
  setUserRoles(@Param('id', { schema: z.uuid() }) id: string, @Body({ schema: SetUserRolesSchema }) body: SetUserRoles) {
    return this.roles.setUserRoles(id, body.roles);
  }
}
