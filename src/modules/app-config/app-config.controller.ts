import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Public, RequirePermission } from '../../common/auth/decorators.js';
import { envelope } from '../../config/openapi.js';
import { AppConfigService } from './app-config.service.js';
import { AppConfigSchema, type ConfigsQuery, ConfigsQuerySchema, type UpsertConfig, UpsertConfigSchema } from './dto/config.dto.js';

/** Route của app-config: (1) /public/configs cho web/app, (2) /admin/configs cho admin (mỗi route một permission). */

// ---------------------------------------------------------------------------------------------------------------------
// 1. Công khai — /api/v1/public/configs
// ---------------------------------------------------------------------------------------------------------------------
@Public()
@ApiTags('Configs')
@Controller('public/configs')
export class AppConfigPublicController {
  constructor(private readonly configs: AppConfigService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({
    summary: 'Config công khai',
  })
  @ApiOkResponse({ standardSchema: envelope(z.array(AppConfigSchema)) })
  listPublic(@Query({ schema: ConfigsQuerySchema }) query: ConfigsQuery) {
    return this.configs.listPublic(query.names ?? []);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// 2. Quản trị — /api/v1/admin/configs
// ---------------------------------------------------------------------------------------------------------------------
@ApiTags('Configs')
@ApiBearerAuth('supabase')
@Controller('admin/configs')
export class AppConfigAdminController {
  constructor(private readonly configs: AppConfigService) {}

  @Get()
  @RequirePermission('config:read')
  @ApiOkResponse({ standardSchema: envelope(z.array(AppConfigSchema)) })
  list(@Query({ schema: ConfigsQuerySchema }) query: ConfigsQuery) {
    return this.configs.list(query.names ?? []);
  }

  @Post()
  @RequirePermission('config:create')
  @ApiCreatedResponse({ standardSchema: envelope(AppConfigSchema) })
  create(@Body({ schema: UpsertConfigSchema }) body: UpsertConfig) {
    return this.configs.create(body);
  }

  @Put(':id')
  @RequirePermission('config:update')
  @ApiOkResponse({ standardSchema: envelope(AppConfigSchema) })
  update(@Param('id', { schema: z.uuid() }) id: string, @Body({ schema: UpsertConfigSchema }) body: UpsertConfig) {
    return this.configs.update(id, body);
  }

  @Delete(':id')
  @RequirePermission('config:delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', { schema: z.uuid() }) id: string): Promise<void> {
    await this.configs.remove(id);
  }
}
