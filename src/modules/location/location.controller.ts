import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth.guard.js';
import { CurrentUser, Public } from '../../common/auth/decorators.js';
import { envelope } from '../../config/openapi.js';
import { type CreateLocation, CreateLocationSchema } from './dto/create-location.dto.js';
import {
  type ListLocationsQuery,
  ListLocationsQuerySchema,
  LocationResponseSchema,
  type NearbyLocationsQuery,
  NearbyLocationsQuerySchema,
  PublicLocationResponseSchema,
} from './dto/location.dto.js';
import { LocationService } from './location.service.js';

/**
 * Route của module location: (1) /locations cần token, (2) /public/locations không cần. Hai class vì prefix và @Public() áp theo class.
 * Controller chỉ khai route + schema, gọi service. Luật nằm ở service.
 */

// ---------------------------------------------------------------------------------------------------------------------
// 1. Route cần đăng nhập — /api/v1/locations
// ---------------------------------------------------------------------------------------------------------------------
@ApiTags('Locations')
@ApiBearerAuth('supabase')
@Controller('locations')
export class LocationController {
  constructor(private readonly locations: LocationService) {}

  @Post()
  @ApiOperation({ summary: 'Lưu một địa điểm (tối đa 20 / user)' })
  @ApiCreatedResponse({ standardSchema: envelope(LocationResponseSchema) })
  create(@CurrentUser() user: AuthUser, @Body({ schema: CreateLocationSchema }) body: CreateLocation) {
    return this.locations.create(user.id, body);
  }

  @Get()
  @ApiOperation({ summary: 'Danh sách địa điểm đã lưu, mới nhất trước, phân trang cursor' })
  @ApiOkResponse({ standardSchema: envelope(z.array(LocationResponseSchema)) })
  list(@CurrentUser() user: AuthUser, @Query({ schema: ListLocationsQuerySchema }) query: ListLocationsQuery) {
    return this.locations.list(user.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết một địa điểm' })
  @ApiOkResponse({ standardSchema: envelope(LocationResponseSchema) })
  get(@CurrentUser() user: AuthUser, @Param('id', { schema: z.uuid() }) id: string) {
    return this.locations.get(user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xoá một địa điểm' })
  async remove(@CurrentUser() user: AuthUser, @Param('id', { schema: z.uuid() }) id: string): Promise<void> {
    await this.locations.remove(user.id, id);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// 2. Route công khai — /api/v1/public/locations (không token, không req.user, không @ApiBearerAuth)
// ---------------------------------------------------------------------------------------------------------------------
@Public()
@ApiTags('Locations') // cùng tag với nhóm 1 → Swagger gom chung một mục
@Controller('public/locations')
export class LocationPublicController {
  constructor(private readonly locations: LocationService) {}

  @Get('nearby')
  @ApiOperation({ summary: 'Địa điểm công khai trong bán kính quanh một toạ độ (PostGIS ST_DWithin), không cần đăng nhập' })
  @ApiOkResponse({ standardSchema: envelope(z.array(PublicLocationResponseSchema)) })
  nearby(@Query({ schema: NearbyLocationsQuerySchema }) query: NearbyLocationsQuery) {
    return this.locations.nearbyPublic(query);
  }
}
