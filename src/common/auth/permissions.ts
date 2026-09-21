/**
 * Toàn bộ permission của hệ thống (`resource:action`) — NGUỒN DUY NHẤT trong code, khớp seed trong `drizzle/*.sql`
 * (test/unit/permissions.spec.ts kiểm). Thêm mã: thêm dòng ở đây + migration INSERT permissions & role_permissions.
 * Action chuẩn: read · create · update · delete; động từ nghiệp vụ khi cần (ban, assign, review, delete_any).
 * Dùng: `@RequirePermission('user:read')`, `hasPermission(perms, 'role:assign')` — gõ sai mã là lỗi compile.
 */
export const PERMISSIONS = {
  'user:read': 'Xem danh sách, chi tiết user',
  'user:create': 'Tạo tài khoản email + mật khẩu',
  'user:ban': 'Khoá / mở khoá user',
  'role:read': 'Xem role, permission, role của user',
  'role:assign': 'Gán role cho user',
  'pin:create': 'Tạo pin',
  'pin:delete_any': 'Xoá pin của người khác',
  'report:review': 'Xử lý báo cáo',
  'landmark:manage': 'Quản lý landmark',
  'promoted:manage': 'Quản lý promoted pin',
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const PERMISSION_CODES = Object.keys(PERMISSIONS) as Permission[];

/** Kiểm trong service khi luật phụ thuộc dữ liệu (guard chỉ kiểm được quyền tĩnh của route). */
export function hasPermission(granted: readonly string[], permission: Permission): boolean {
  return granted.includes(permission);
}
