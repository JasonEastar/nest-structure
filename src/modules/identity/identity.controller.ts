import { Controller, Delete, Get, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthUser } from '../../common/auth.guard.js';
import { CurrentUser } from '../../common/decorators.js';
import { zodResponse } from '../../common/openapi.js';
import { MeResponseSchema } from './identity.dto.js';
import { IdentityService } from './identity.service.js';

@ApiTags('identity')
@ApiBearerAuth('supabase')
@Controller('me')
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  @Get()
  @ApiOperation({ summary: 'Hồ sơ của tôi (tạo tự động ở request đầu sau khi đăng nhập Google)' })
  @ApiOkResponse({ schema: zodResponse(MeResponseSchema, true) })
  me(@CurrentUser() user: AuthUser) {
    return this.identity.getMe(user.id);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xoá tài khoản: xoá dữ liệu local rồi xoá user trên Supabase' })
  async deleteMe(@CurrentUser() user: AuthUser): Promise<void> {
    await this.identity.deleteMe(user.id);
  }
}
