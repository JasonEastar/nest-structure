import { z } from 'zod';
import { APP_CONFIG_LIMITS } from '../app-config.constants.js';
import type { AppConfigRow } from '../schema/app-config.schema.js';

/** DTO app-config: GET /public/configs · GET|POST /admin/configs · PUT|DELETE /admin/configs/:id. */

/** `?names=a` một giá trị → Express đưa chuỗi; bọc thành mảng. `undefined` giữ nguyên để Swagger ghi đúng "không bắt buộc". */
const toArray = (v: unknown) => (v === undefined || Array.isArray(v) ? v : [v]);

/** `?names=a&names=b` KHÔNG bắt buộc: bỏ trống → tất cả; tên lạ bị bỏ qua để app cũ không vỡ. */
export const ConfigsQuerySchema = z.object({
  names: z
    .preprocess(toArray, z.array(z.string().trim().min(1).max(APP_CONFIG_LIMITS.name.max)).max(APP_CONFIG_LIMITS.namesPerQuery))
    .optional(),
});
export type ConfigsQuery = z.infer<typeof ConfigsQuerySchema>;

const ConfigDataSchema = z
  .record(z.string(), z.unknown())
  .refine((data) => JSON.stringify(data).length <= APP_CONFIG_LIMITS.dataMaxBytes, `data tối đa ${APP_CONFIG_LIMITS.dataMaxBytes} byte`);

/** Body POST/PUT — thay toàn bộ `data` (client giữ nguyên phần không đổi rồi gửi lại). */
export const UpsertConfigSchema = z.object({
  name: z.string().trim().min(1).max(APP_CONFIG_LIMITS.name.max).regex(APP_CONFIG_LIMITS.name.pattern, 'Chỉ gồm a-z, 0-9 và _'),
  data: ConfigDataSchema,
  isPublic: z.boolean().default(false),
}).meta({ id: 'UpsertConfig' });
export type UpsertConfig = z.infer<typeof UpsertConfigSchema>;

export const AppConfigSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  data: z.record(z.string(), z.unknown()),
  isPublic: z.boolean(),
  updatedAt: z.iso.datetime(),
}).meta({ id: 'AppConfig' });
export type AppConfig = z.infer<typeof AppConfigSchema>;

export function toAppConfig(row: AppConfigRow): AppConfig {
  return { id: row.id, name: row.name, data: row.data, isPublic: row.isPublic, updatedAt: row.updatedAt.toISOString() };
}
