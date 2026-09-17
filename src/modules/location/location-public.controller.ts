import { Controller, Get, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Public } from '../../common/auth/decorators.js';
import { zodResponse } from '../../config/openapi.js';
import { type NearbyLocationsQuery, NearbyLocationsQuerySchema, PublicLocationResponseSchema } from './dto/location.dto.js';
import { LocationService } from './location.service.js';

/**
 * Quy ước API công khai (không cần đăng nhập): đường dẫn `/api/v1/public/<resource>/...`, controller riêng
 * `<x>-public.controller.ts` có `@Public()` ở class → AuthGuard bỏ qua, KHÔNG có @ApiBearerAuth.
 * Vẫn bị rate limit (tracker theo x-device-id rồi IP) và chỉ trả trường an toàn — không lộ dữ liệu của user.
 */
@Public()
@ApiTags('public: locations')
@Controller('public/locations')
export class LocationPublicController {
  constructor(private readonly locations: LocationService) {}

  @Get('nearby')
  @ApiOperation({ summary: 'Địa điểm công khai trong bán kính quanh một toạ độ (PostGIS ST_DWithin), không cần đăng nhập' })
  @ApiOkResponse({ schema: zodResponse(z.array(PublicLocationResponseSchema), true) })
  nearby(@Query({ schema: NearbyLocationsQuerySchema }) query: NearbyLocationsQuery) {
    return this.locations.nearbyPublic(query);
  }
}
