import { join } from 'node:path';
import { AcceptLanguageResolver, I18nModule } from 'nestjs-i18n';

/**
 * i18n chỉ dùng ở server cho push notification và tên category (theo locale NGƯỜI NHẬN).
 * Lỗi API trả mã, không dịch. Ngôn ngữ: vi (mặc định), en.
 * Resolver: `user.locale` (phase 06, khi có req.user) → Accept-Language → vi.
 * Thư mục i18n/ ở gốc repo (không trong src/) → dist không cần copy asset.
 */
export const SUPPORTED_LOCALES = ['vi', 'en'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const AppI18nModule = I18nModule.forRoot({
  fallbackLanguage: 'vi',
  loaderOptions: {
    path: join(process.cwd(), 'i18n'),
    watch: false,
  },
  resolvers: [new AcceptLanguageResolver({ matchType: 'strict-loose' })],
  logging: false,
});
