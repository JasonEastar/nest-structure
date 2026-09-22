/** Hằng số của app-config. Dữ liệu config nằm trong bảng app_configs (seed đầu: drizzle/0008), admin sửa qua /admin/configs. */
export const APP_CONFIG_LIMITS = {
  name: { max: 50, pattern: /^[a-z0-9_]+$/ }, // vd system_enums, support_bank
  namesPerQuery: 20,
  dataMaxBytes: 64 * 1024, // một config là một object JSON nhỏ cho client tải lúc mở app
} as const;
