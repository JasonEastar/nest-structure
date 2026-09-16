-- Seed RBAC (idempotent). Roles/permissions theo system-architecture §5.1b.
-- id uuid v7 sinh app-side ở runtime; seed dùng gen_random_uuid() (pgcrypto có sẵn PG13+).
INSERT INTO roles (id, code, name) VALUES
  (gen_random_uuid(), 'user',      'Người dùng'),
  (gen_random_uuid(), 'moderator', 'Kiểm duyệt viên'),
  (gen_random_uuid(), 'venue',     'Chủ quán'),
  (gen_random_uuid(), 'admin',     'Quản trị')
ON CONFLICT (code) DO NOTHING;

INSERT INTO permissions (id, code, description) VALUES
  (gen_random_uuid(), 'pin:create',      'Tạo pin'),
  (gen_random_uuid(), 'pin:delete_any',  'Xoá pin của người khác'),
  (gen_random_uuid(), 'report:review',   'Xử lý báo cáo'),
  (gen_random_uuid(), 'user:ban',        'Khoá tài khoản'),
  (gen_random_uuid(), 'landmark:manage', 'Quản lý landmark'),
  (gen_random_uuid(), 'promoted:manage', 'Quản lý promoted pin'),
  (gen_random_uuid(), 'queue:read',      'Xem Bull Board'),
  (gen_random_uuid(), 'role:manage',     'Gán role cho user')
ON CONFLICT (code) DO NOTHING;

-- role → permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON (
  (r.code = 'user'      AND p.code IN ('pin:create')) OR
  (r.code = 'venue'     AND p.code IN ('pin:create', 'promoted:manage')) OR
  (r.code = 'moderator' AND p.code IN ('pin:create', 'pin:delete_any', 'report:review', 'user:ban', 'landmark:manage')) OR
  (r.code = 'admin')
)
ON CONFLICT DO NOTHING;
