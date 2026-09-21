-- Gỡ bảng devices (push token: thêm lại ở bước 11) và permission queue:read (Bull Board gỡ, thêm lại cùng queue đầu tiên).
DROP TABLE IF EXISTS "devices";--> statement-breakpoint
DELETE FROM permissions WHERE code = 'queue:read';
