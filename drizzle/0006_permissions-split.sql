-- Tách permission gộp thành từng hành động (common/auth/permissions.ts):
--   role:manage → role:read + role:assign · user:manage → user:read + user:create
-- Role nào đang có mã cũ nhận đủ mã mới, rồi xoá mã cũ (role_permissions cascade).
INSERT INTO permissions (id, code, description) VALUES
  (gen_random_uuid(), 'user:read',   'Xem danh sách, chi tiết user'),
  (gen_random_uuid(), 'user:create', 'Tạo tài khoản email + mật khẩu'),
  (gen_random_uuid(), 'role:read',   'Xem role, permission, role của user'),
  (gen_random_uuid(), 'role:assign', 'Gán role cho user')
ON CONFLICT (code) DO NOTHING;--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission_id)
SELECT rp.role_id, p.id
FROM role_permissions rp
JOIN permissions old ON old.id = rp.permission_id
JOIN permissions p ON (
  (old.code = 'role:manage' AND p.code IN ('role:read', 'role:assign')) OR
  (old.code = 'user:manage' AND p.code IN ('user:read', 'user:create'))
)
ON CONFLICT DO NOTHING;--> statement-breakpoint
DELETE FROM permissions WHERE code IN ('role:manage', 'user:manage');
