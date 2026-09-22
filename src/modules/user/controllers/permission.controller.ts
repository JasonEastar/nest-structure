import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { RequirePermission } from '../../../common/auth/decorators.js';
import { envelope } from '../../../config/openapi.js';
import {
  PermissionGroupSchema,
  PermissionSchema,
  type UpsertPermission,
  type UpsertPermissionGroup,
  UpsertPermissionGroupSchema,
  UpsertPermissionSchema,
} from '../dto/permission.dto.js';
import { PermissionService } from '../services/permission.service.js';

const GroupWithoutPermissions = PermissionGroupSchema.omit({ permissions: true }).meta({ id: 'PermissionGroupSummary' });

/** Permission — /admin/permissions CRUD theo id (sửa được cả code), /admin/permission-groups CRUD nhóm = tab. Tag "Permissions". */
@ApiTags('Permissions')
@ApiBearerAuth('supabase')
@Controller('admin')
export class PermissionController {
  constructor(private readonly permissions: PermissionService) {}

  @Get('permissions')
  @RequirePermission('permission:read')
  @ApiOperation({ summary: 'Permission theo nhóm (tab)' })
  @ApiOkResponse({ standardSchema: envelope(z.array(PermissionGroupSchema)) })
  list() {
    return this.permissions.listGrouped();
  }

  @Post('permissions')
  @RequirePermission('permission:create')
  @ApiOperation({ summary: 'Tạo permission' })
  @ApiCreatedResponse({ standardSchema: envelope(PermissionSchema) })
  createPermission(@Body({ schema: UpsertPermissionSchema }) body: UpsertPermission) {
    return this.permissions.createPermission(body);
  }

  @Put('permissions/:id')
  @RequirePermission('permission:update')
  @ApiOperation({ summary: 'Sửa permission (code, mô tả, nhóm)' })
  @ApiOkResponse({ standardSchema: envelope(PermissionSchema) })
  updatePermission(@Param('id', { schema: z.uuid() }) id: string, @Body({ schema: UpsertPermissionSchema }) body: UpsertPermission) {
    return this.permissions.updatePermission(id, body);
  }

  @Delete('permissions/:id')
  @RequirePermission('permission:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xoá permission' })
  async removePermission(@Param('id', { schema: z.uuid() }) id: string): Promise<void> {
    await this.permissions.removePermission(id);
  }

  @Post('permission-groups')
  @RequirePermission('permission_group:create')
  @ApiOperation({ summary: 'Tạo nhóm permission' })
  @ApiCreatedResponse({ standardSchema: envelope(GroupWithoutPermissions) })
  createGroup(@Body({ schema: UpsertPermissionGroupSchema }) body: UpsertPermissionGroup) {
    return this.permissions.createGroup(body);
  }

  @Put('permission-groups/:id')
  @RequirePermission('permission_group:update')
  @ApiOperation({ summary: 'Sửa nhóm permission' })
  @ApiOkResponse({ standardSchema: envelope(GroupWithoutPermissions) })
  updateGroup(@Param('id', { schema: z.uuid() }) id: string, @Body({ schema: UpsertPermissionGroupSchema }) body: UpsertPermissionGroup) {
    return this.permissions.updateGroup(id, body);
  }

  @Delete('permission-groups/:id')
  @RequirePermission('permission_group:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xoá nhóm permission' })
  async removeGroup(@Param('id', { schema: z.uuid() }) id: string): Promise<void> {
    await this.permissions.removeGroup(id);
  }
}
