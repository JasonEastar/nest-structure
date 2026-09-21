import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Public } from '../../common/auth/decorators.js';
import { envelope } from '../../config/openapi.js';
import { AppConfigService } from './app-config.service.js';
import { CONFIG_NAMES } from './app-config.constants.js';
import { ConfigItemSchema, type ConfigsQuery, ConfigsQuerySchema } from './dto/config.dto.js';

/** GET /api/v1/public/configs — web/app gọi một lần lúc mở để có enum + nhãn mọi ngôn ngữ. */
@Public()
@ApiTags('Configs')
@Controller('public/configs')
export class AppConfigController {
  constructor(private readonly configs: AppConfigService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=300')
  @ApiOperation({
    summary: 'Config công khai (enum + nhãn đa ngôn ngữ)',
    description:
      `\`?names=\` lặp lại để lấy nhiều (\`?names=system_enums&names=...\`); bỏ trống → tất cả; tên lạ bị bỏ qua. Có: ${CONFIG_NAMES.map((n) => `\`${n}\``).join(', ')}.\n\n`
      + '`system_enums.data` = `{ enums: { "user.status": { active: { sort, color, label: { vi, en } } } }, languages, defaultLanguage }` — '
      + 'nhãn trả sẵn MỌI ngôn ngữ để client đổi ngôn ngữ không cần gọi lại (khác lỗi: lỗi dịch theo `Accept-Language`).',
  })
  @ApiOkResponse({ standardSchema: envelope(z.array(ConfigItemSchema)) })
  list(@Query({ schema: ConfigsQuerySchema }) query: ConfigsQuery) {
    return this.configs.getConfigs(query.names);
  }
}
