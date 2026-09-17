import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth.guard.js';
import { CurrentUser } from '../../common/auth/decorators.js';
import { zodResponse } from '../../config/openapi.js';
import { type CreateLocation, CreateLocationSchema } from './dto/create-location.dto.js';
import {
  type ListLocationsQuery,
  ListLocationsQuerySchema,
  LocationResponseSchema,
  NearbyLocationResponseSchema,
  type NearbyLocationsQuery,
  NearbyLocationsQuerySchema,
} from './dto/location.dto.js';
import { LocationService } from './location.service.js';

/**
 * /api/v1/locations — địa điểm đã lưu của user đang đăng nhập.
 * Controller chỉ: khai route, gắn schema zod (pipe toàn cục validate), lấy user, gọi service, return.
 * Không có @Public() → AuthGuard bắt buộc token. Không cần permission riêng: dữ liệu của chính user.
 */
@ApiTags('locations')
@ApiBearerAuth('supabase')
@Controller('locations')
export class LocationController {
  constructor(private readonly locations: LocationService) {}

  @Post()
  @ApiOperation({ summary: 'Lưu một địa điểm (tối đa 20 / user)' })
  @ApiCreatedResponse({ schema: zodResponse(LocationResponseSchema, true) })
  create(@CurrentUser() user: AuthUser, @Body({ schema: CreateLocationSchema }) body: CreateLocation) {
    return this.locations.create(user.id, body);
  }

  @Get()
  @ApiOperation({ summary: 'Danh sách địa điểm đã lưu, mới nhất trước, phân trang cursor' })
  @ApiOkResponse({ schema: zodResponse(z.array(LocationResponseSchema), true) })
  list(@CurrentUser() user: AuthUser, @Query({ schema: ListLocationsQuerySchema }) query: ListLocationsQuery) {
    return this.locations.list(user.id, query);
  }

  @Get('nearby')
  @ApiOperation({ summary: 'Địa điểm đã lưu trong bán kính quanh một toạ độ (PostGIS ST_DWithin)' })
  @ApiOkResponse({ schema: zodResponse(z.array(NearbyLocationResponseSchema), true) })
  nearby(@CurrentUser() user: AuthUser, @Query({ schema: NearbyLocationsQuerySchema }) query: NearbyLocationsQuery) {
    return this.locations.nearby(user.id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết một địa điểm' })
  @ApiOkResponse({ schema: zodResponse(LocationResponseSchema, true) })
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
