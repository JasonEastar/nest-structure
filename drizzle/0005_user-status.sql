ALTER TABLE "profiles" ADD COLUMN "status" text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "status_reason" text;--> statement-breakpoint
-- Permission mới cho admin tạo/xem user (POST, GET /admin/users). Seed 0002 không sửa; admin nhận thêm ở đây.
INSERT INTO permissions (id, code, description) VALUES
  (gen_random_uuid(), 'user:manage', 'Tạo và xem danh sách user')
ON CONFLICT (code) DO NOTHING;--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON r.code = 'admin' AND p.code = 'user:manage'
ON CONFLICT DO NOTHING;
