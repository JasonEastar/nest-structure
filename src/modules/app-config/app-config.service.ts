import { Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { DEFAULT_LOCALE } from '../../config/i18n.js';
import { CONFIG_NAMES, type ConfigName, SYSTEM_ENUMS } from './app-config.constants.js';
import type { ConfigItem, SystemEnums } from './dto/config.dto.js';

/** Ghép config từ code + i18n. Không DB, không cache: dữ liệu tĩnh theo bản build, client cache qua Cache-Control. */
@Injectable()
export class AppConfigService {
  constructor(private readonly i18n: I18nService) {}

  /** Trả các config được hỏi (thứ tự cố định theo CONFIG_NAMES); không hỏi → tất cả; tên lạ → bỏ qua. */
  getConfigs(names: string[]): ConfigItem[] {
    const wanted = names.length ? CONFIG_NAMES.filter((n) => names.includes(n)) : CONFIG_NAMES;
    return wanted.map((name) => ({ name, data: this.build(name) }));
  }

  private build(name: ConfigName): SystemEnums {
    switch (name) {
      case 'system_enums':
        return this.systemEnums();
    }
  }

  private systemEnums(): SystemEnums {
    const languages = this.i18n.getSupportedLanguages();
    const enums: SystemEnums['enums'] = {};
    for (const def of SYSTEM_ENUMS) {
      enums[def.key] = Object.fromEntries(
        def.codes.map((code, i) => [
          code,
          {
            sort: i + 1,
            color: def.colors?.[code] ?? null,
            label: Object.fromEntries(languages.map((lang) => [lang, this.i18n.t(`enums.${def.key}.${code}`, { lang })])),
          },
        ]),
      );
    }
    return { enums, languages, defaultLanguage: DEFAULT_LOCALE };
  }
}
