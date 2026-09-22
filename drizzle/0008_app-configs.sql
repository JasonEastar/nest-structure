CREATE TABLE "app_configs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"data" jsonb NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_configs_name_unique" UNIQUE("name")
);
--> statement-breakpoint
-- Permission cho admin quản lý config (common/auth/permissions.ts)
INSERT INTO permissions (id, code, description) VALUES
  (gen_random_uuid(), 'config:read',   'Xem mọi config (kể cả private)'),
  (gen_random_uuid(), 'config:create', 'Tạo config'),
  (gen_random_uuid(), 'config:update', 'Sửa config'),
  (gen_random_uuid(), 'config:delete', 'Xoá config')
ON CONFLICT (code) DO NOTHING;--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON r.code = 'admin' AND p.code LIKE 'config:%'
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Seed system_enums: enum + nhãn đa ngôn ngữ cho client (admin sửa tiếp qua /admin/configs)
INSERT INTO app_configs (id, name, data, is_public) VALUES
  (gen_random_uuid(), 'system_enums', '{"enums":{"user.status":{"active":{"sort":1,"color":"#22c55e","label":{"vi":"Đang hoạt động","en":"Active"}},"blocked":{"sort":2,"color":"#ef4444","label":{"vi":"Bị khoá","en":"Blocked"}}},"role.code":{"user":{"sort":1,"color":"#6b7280","label":{"vi":"Người dùng","en":"User"}},"moderator":{"sort":2,"color":"#3b82f6","label":{"vi":"Kiểm duyệt viên","en":"Moderator"}},"venue":{"sort":3,"color":"#f59e0b","label":{"vi":"Chủ quán","en":"Venue owner"}},"admin":{"sort":4,"color":"#a855f7","label":{"vi":"Quản trị","en":"Admin"}}}},"languages":["vi","en"],"defaultLanguage":"vi"}'::jsonb, true)
ON CONFLICT (name) DO NOTHING;
