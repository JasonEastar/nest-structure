import { join } from 'node:path';
import { AcceptLanguageResolver, I18nModule } from 'nestjs-i18n';

/**
 * Đa ngôn ngữ vi/en (nestjs-i18n). Câu chữ ở `i18n/<lang>/*.json`: errors.json (message lỗi), validation.json (lỗi theo field: key `validation.*`;
 * lỗi zod gốc dịch bằng zod locale trong AllExceptionsFilter). Nhãn enum cho client nằm trong DB (app_configs.system_enums), không ở đây.
 * Ngôn ngữ của request lấy DUY NHẤT từ header `Accept-Language`, không có thì vi.
 * Dùng: `I18nContext.current(host)?.lang` lấy ngôn ngữ; `I18nService.t('errors.NOT_FOUND', { lang, args })` dịch.
 */
export const LOCALES = ['vi', 'en'] as const; // = thư mục i18n/<lang>; thêm ngôn ngữ: thêm thư mục + phần tử ở đây
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'vi';

export const AppI18nModule = I18nModule.forRoot({
  fallbackLanguage: DEFAULT_LOCALE,
  loaderOptions: { path: join(process.cwd(), 'i18n'), watch: false },
  resolvers: [new AcceptLanguageResolver({ matchType: 'strict-loose' })], // 'en-US' → en; ngôn ngữ lạ → fallback vi
  logging: false,
});
