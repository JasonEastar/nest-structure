import { z } from 'zod';
import { zText } from '../../../common/http/validation.js';
import { PermissionCodeSchema } from './role.dto.js';
import { ROLE_CODE, ROLE_NAME_MAX } from '../user.constants.js';

/** DTO permission + nhóm (tab admin UI). Admin CRUD cả hai theo id, sửa được cả `code`; permission luôn thuộc một nhóm.
 * Mã phải trùng với chuỗi trong `@RequirePermission(...)` của route — đổi/xoá mã đang dùng thì route đó không ai vào được. */

export const PermissionSchema = z.object({
  id: z.uuid(),
  code: PermissionCodeSchema,
  description: z.string().nullable(),
  groupId: z.uuid(),
}).meta({ id: 'Permission' });
export type Permission = z.infer<typeof PermissionSchema>;

/** GET /admin/permissions: mỗi phần tử = một tab. */
export const PermissionGroupSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  sort: z.number().int(),
  permissions: z.array(PermissionSchema),
}).meta({ id: 'PermissionGroup' });
export type PermissionGroup = z.infer<typeof PermissionGroupSchema>;

/** POST/PUT /admin/permission-groups. */
export const UpsertPermissionGroupSchema = z.object({
  code: z.string().trim().min(ROLE_CODE.min).max(ROLE_CODE.max).regex(ROLE_CODE.pattern, 'validation.code_format'),
  name: zText(ROLE_NAME_MAX),
  description: zText(200).nullable().optional(),
  sort: z.number().int().min(0).max(1000).default(0),
}).meta({ id: 'UpsertPermissionGroup' });
export type UpsertPermissionGroup = z.infer<typeof UpsertPermissionGroupSchema>;

/** POST /admin/permissions (tạo) và PUT /admin/permissions/:id (thay toàn bộ). */
export const UpsertPermissionSchema = z.object({
  code: PermissionCodeSchema,
  description: zText(200).nullable().optional(),
  groupId: z.uuid(),
}).meta({ id: 'UpsertPermission' });
export type UpsertPermission = z.infer<typeof UpsertPermissionSchema>;
