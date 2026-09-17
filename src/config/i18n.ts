import { join } from 'node:path';
import { AcceptLanguageResolver, I18nModule, QueryResolver } from 'nestjs-i18n';

/**
 * Đa ngôn ngữ (nestjs-i18n). File dịch ở `i18n/<lang>/<namespace>.json` (gốc repo, Dockerfile COPY sẵn):
 * - errors.json : câu `message` trong body lỗi (AllExceptionsFilter dịch theo mã lỗi + params).
 * - common.json : câu dùng chung, template push notification (bước 11).
 * Ngôn ngữ của một request quyết định theo thứ tự: `?lang=en` (tiện test trên Swagger) → header `Accept-Language`
 * → mặc định vi. Response luôn kèm header `Content-Language` để client biết đã nhận ngôn ngữ nào.
 * Trong code: `I18nContext.current(host)?.lang` lấy ngôn ngữ; `I18nService.t('errors.NOT_FOUND', { lang, args })` dịch.
 */
export const SUPPORTED_LOCALES = ['vi', 'en'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'vi';

export const AppI18nModule = I18nModule.forRoot({
  fallbackLanguage: DEFAULT_LOCALE,
  loaderOptions: { path: join(process.cwd(), 'i18n'), watch: false },
  resolvers: [new QueryResolver(['lang']), new AcceptLanguageResolver({ matchType: 'strict-loose' })],
  logging: false,
});
