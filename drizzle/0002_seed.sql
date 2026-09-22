-- Dữ liệu ban đầu (idempotent). Role/permission/nhóm/config sau đó do admin quản lý qua API.
INSERT INTO roles (id, code, name, is_system) VALUES
  (gen_random_uuid(), 'user',      'Người dùng',     true),  -- gán mặc định khi tạo profile lần đầu
  (gen_random_uuid(), 'moderator', 'Kiểm duyệt viên', false),
  (gen_random_uuid(), 'venue',     'Chủ quán',        false),
  (gen_random_uuid(), 'admin',     'Quản trị',        true)   -- luôn có mọi permission trong bảng
ON CONFLICT (code) DO NOTHING;--> statement-breakpoint
INSERT INTO permission_groups (id, code, name, description, sort) VALUES
  (gen_random_uuid(), 'user',   'Người dùng', 'Xem, tạo, khoá tài khoản',                   1),
  (gen_random_uuid(), 'access', 'Phân quyền', 'Role, permission, nhóm permission',          2),
  (gen_random_uuid(), 'config', 'Cấu hình',   'Config động cho web/app',                    3),
  (gen_random_uuid(), 'pin',    'Pin',        'Pin, báo cáo, landmark, promoted (bước 7+)', 4)
ON CONFLICT (code) DO NOTHING;--> statement-breakpoint
-- Mã permission = chuỗi trong @RequirePermission('...') của route
INSERT INTO permissions (id, code, description, group_id)
SELECT gen_random_uuid(), v.code, v.description, g.id
FROM (VALUES
  ('user:read',               'Xem danh sách, chi tiết user',        'user'),
  ('user:create',             'Tạo tài khoản email + mật khẩu',       'user'),
  ('user:ban',                'Khoá / mở khoá user',                  'user'),
  ('role:read',               'Xem role, role của user',              'access'),
  ('role:create',             'Tạo role',                             'access'),
  ('role:update',             'Sửa tên/mô tả/permission của role',    'access'),
  ('role:delete',             'Xoá role',                             'access'),
  ('role:assign',             'Gán role cho user',                    'access'),
  ('permission:read',         'Xem permission theo nhóm',             'access'),
  ('permission:create',       'Tạo permission',                       'access'),
  ('permission:update',       'Sửa permission (code, mô tả, nhóm)',   'access'),
  ('permission:delete',       'Xoá permission',                       'access'),
  ('permission_group:create', 'Tạo nhóm permission',                  'access'),
  ('permission_group:update', 'Sửa nhóm permission',                  'access'),
  ('permission_group:delete', 'Xoá nhóm permission',                  'access'),
  ('config:read',             'Xem mọi config (kể cả private)',       'config'),
  ('config:create',           'Tạo config',                           'config'),
  ('config:update',           'Sửa config',                           'config'),
  ('config:delete',           'Xoá config',                           'config'),
  ('pin:create',              'Tạo pin',                              'pin'),
  ('pin:delete_any',          'Xoá pin của người khác',               'pin'),
  ('report:review',           'Xử lý báo cáo',                        'pin'),
  ('landmark:manage',         'Quản lý landmark',                     'pin'),
  ('promoted:manage',         'Quản lý promoted pin',                 'pin')
) AS v(code, description, group_code)
JOIN permission_groups g ON g.code = v.group_code
ON CONFLICT (code) DO NOTHING;--> statement-breakpoint
-- admin không cần gán: code coi role admin = mọi permission
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON (
  (r.code = 'user'      AND p.code IN ('pin:create')) OR
  (r.code = 'venue'     AND p.code IN ('pin:create', 'promoted:manage')) OR
  (r.code = 'moderator' AND p.code IN ('pin:create', 'pin:delete_any', 'report:review', 'user:ban', 'landmark:manage'))
)
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Enum + nhãn đa ngôn ngữ cho client (GET /public/configs); admin sửa tiếp qua /admin/configs
INSERT INTO app_configs (id, name, data, is_public) VALUES
  (gen_random_uuid(), 'system_enums', '{"enums":{"user.status":{"active":{"sort":1,"color":"#22c55e","label":{"vi":"Đang hoạt động","en":"Active"}},"blocked":{"sort":2,"color":"#ef4444","label":{"vi":"Bị khoá","en":"Blocked"}}},"role.code":{"user":{"sort":1,"color":"#6b7280","label":{"vi":"Người dùng","en":"User"}},"moderator":{"sort":2,"color":"#3b82f6","label":{"vi":"Kiểm duyệt viên","en":"Moderator"}},"venue":{"sort":3,"color":"#f59e0b","label":{"vi":"Chủ quán","en":"Venue owner"}},"admin":{"sort":4,"color":"#a855f7","label":{"vi":"Quản trị","en":"Admin"}}}},"languages":["vi","en"],"defaultLanguage":"vi"}'::jsonb, true)
ON CONFLICT (name) DO NOTHING;
