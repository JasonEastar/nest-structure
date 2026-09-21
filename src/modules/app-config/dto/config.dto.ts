import { z } from 'zod';

/** DTO /public/configs. `data` khác nhau theo `name` (system_enums: { enums, languages, defaultLanguage }). */

const toArray = (v: unknown) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

/** `?names=a&names=b`; bỏ trống → trả mọi config. Tên lạ bị bỏ qua để app cũ không vỡ. */
export const ConfigsQuerySchema = z.object({
  names: z.preprocess(toArray, z.array(z.string().trim().min(1).max(50)).max(20)),
});
export type ConfigsQuery = z.infer<typeof ConfigsQuerySchema>;

export const EnumValueSchema = z.object({
  sort: z.number().int(),
  color: z.string().nullable(),
  label: z.record(z.string(), z.string()), // { vi, en }
});

export const SystemEnumsSchema = z.object({
  enums: z.record(z.string(), z.record(z.string(), EnumValueSchema)), // { 'user.status': { active: {...} } }
  languages: z.array(z.string()),
  defaultLanguage: z.string(),
}).meta({ id: 'SystemEnums' });
export type SystemEnums = z.infer<typeof SystemEnumsSchema>;

export const ConfigItemSchema = z.object({
  name: z.string(),
  data: z.record(z.string(), z.unknown()),
}).meta({ id: 'ConfigItem' });
export type ConfigItem = z.infer<typeof ConfigItemSchema>;
