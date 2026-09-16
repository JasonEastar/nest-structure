# Phase 06 — Supabase Auth (Google) + RBAC: JWKS guard, profile upsert, permissions, admin roles API, `/me`

## Context links
- [plan.md](./plan.md) · [ADR-0002](../../docs/adr/0002-supabase-auth-va-postgres.md) · [ADR-0005](../../docs/adr/0005-postgres-rieng-supabase-chi-auth.md) · [ADR-0006](../../docs/adr/0006-all-in-one-cau-truc-don-gian.md) · [code-standards §2.4–2.5, §2.7](../../docs/code-standards.md) · [system-architecture §5](../../docs/system-architecture.md)
- [Supabase report](../reports/researcher-260916-supabase-auth-nestjs.md) §1, §5, §8, §9 · NestJS docs [03 security](../reports/nestjs-docs-03-security-openapi.md)

## Overview
**Ngày:** 2026-09-16 · **Ưu tiên:** P0 · **Trạng thái:** ☐ Chưa bắt đầu
NestJS **chỉ verify** JWT Supabase (Google) qua JWKS; profile upsert phía app ở request đầu; RBAC bằng bảng + cache Redis; admin API gán role; `GET/DELETE /me`.

## Key insights
- **Từ phase 05:** Bull Board mount như Express middleware → guard Nest không chạy; bảo vệ `/admin/queues` bằng một middleware nhỏ trong `bull-board.ts`: verify JWT (SupabaseJwtService) + permission `queue:read` (IdentityService.getPermissions), 401/403 theo shape lỗi. Thay `if NODE_ENV !== production`.
- JWKS `${SUPABASE_URL}/auth/v1/.well-known/jwks.json` (`jose.createRemoteJWKSet`, cache `kid`); kiểm `iss = ${SUPABASE_URL}/auth/v1`, `aud = authenticated`, `clockTolerance 5`. Hosted project phát ES256.
- Token 3600 s. Thu hồi quyền: cache `c9:perms:{userId}` 300 s, admin đổi → `DEL`. Ban (gđ moderation) → `c9:banned:{id}` kiểm trong guard.
- Claims: `sub`, `email`, `session_id`, `is_anonymous`, `user_metadata.full_name`, `user_metadata.avatar_url`. NEVER role trong JWT.
- **Profile upsert app-side**: `AuthGuard` → `IdentityService.ensureProfile(claims)`: flag `c9:v1:profile-exists:{sub}` TTL 1h → miss → tx `INSERT profiles … ON CONFLICT (id) DO NOTHING` + `INSERT user_roles (user_id, role 'user') ON CONFLICT DO NOTHING` → set flag. Idempotent trên 2 instance.
- Guard chain trong `app.module.ts` providers: Throttler (phase 05) → `AuthGuard` → `PermissionGuard`. Decorator qua `Reflector.createDecorator`: `Public`, `RequirePermissions`; `CurrentUser` qua `createParamDecorator`.
- `SUPABASE_ADMIN` là Symbol token + interface nhỏ (`createUser`, `getUserById`, `generateLink`, `deleteUser`) trong `common/supabase.ts`; adapter dùng `@supabase/supabase-js` service role (`persistSession:false`). Mock cho unit/contract test.
- `DELETE /me`: tx local (xoá `profiles` → cascade `user_roles`, `devices`) → `DEL` cache → `SUPABASE_ADMIN.deleteUser(sub)` (bỏ qua 404). Idempotent.
- E2E token thật không qua Google: `admin.createUser({email, email_confirm:true})` → `admin.generateLink({type:'magiclink'})` → anon `verifyOtp({token_hash, type:'magiclink'})` → `access_token`. Cần `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- `AuthGuard` (common) gọi `IdentityService` (modules): ngoại lệ duy nhất của "common không import modules". Nếu tạo vòng → chuyển `ensureProfile` sang `common/auth.guard.ts` dùng `DRIZZLE` trực tiếp.
- Phone verified: gđ 2, chỉ ghi chú.

## Requirements
- Không token → 401 `UNAUTHENTICATED`; sai/hết hạn → 401; thiếu permission → 403 `FORBIDDEN`; `is_anonymous` → 401.
- Request hợp lệ đầu tiên của `sub` mới → có `profiles` + `user_roles(user)`; request thứ hai không chạm DB (flag).
- `GET /me` → `{ data: { id, email, displayName, username, avatarUrl, locale, phoneVerified, roles[] } }`.
- `x-device-id` → upsert `devices` (ghi tối đa 1 lần/5 phút/device qua cache flag; fire-and-forget có `.catch`).
- `PUT /admin/users/:id/roles { roles:['moderator'] }` cần `role:manage`; `/me` của user đó thấy role mới ngay.
- Bull Board `/admin/queues` yêu cầu `queue:read`.

## Architecture
```
src/common/
├── supabase.ts                   # SUPABASE_ADMIN token + SupabaseAdminPort + SupabaseAdminAdapter · SupabaseJwtService.verify(token) → claims
├── auth.guard.ts                 # APP_GUARD: @Public bỏ qua · Bearer → verify → ensureProfile → req.user · touchDevice().catch
├── permission.guard.ts           # APP_GUARD: RequirePermissions ↔ getPermissions(userId) (cache 300s)
└── decorators.ts                 # Public, RequirePermissions (Reflector.createDecorator), CurrentUser
src/modules/identity/
├── identity.module.ts            # export IdentityService
├── identity.controller.ts        # GET /me · DELETE /me
├── identity-admin.controller.ts  # GET /admin/roles · GET/PUT /admin/users/:id/roles (document admin)
├── identity.service.ts           # ensureProfile · getMe · deleteMe · touchDevice · getPermissions · setUserRoles
├── identity.repository.ts        # profiles upsert · roles · user_roles→permissions · devices upsert
├── identity.schema.ts            # (phase 03)
└── identity.dto.ts               # MeResponseSchema · SetUserRolesSchema · RoleSchema
src/config/env.ts                 # + SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
scripts/dev-token.mjs             # createUser + magiclink → verifyOtp → in access_token
scripts/db-seed-admin.sql         # gán role admin cho <userId>
test/e2e/auth-me.e2e.spec.ts      # skipIf thiếu SUPABASE_*
```

## Related code files (CREATE)
- `src/common/{supabase.ts, auth.guard.ts, permission.guard.ts, decorators.ts}`
- `src/modules/identity/{identity.module.ts, identity.controller.ts, identity-admin.controller.ts, identity.service.ts, identity.repository.ts, identity.dto.ts}`
- `scripts/dev-token.mjs`, `scripts/db-seed-admin.sql`, `test/e2e/auth-me.e2e.spec.ts`
- sửa `src/config/env.ts`, `src/app.module.ts` (APP_GUARD Auth, Permission sau Throttler; import IdentityModule; Bull Board guard), `src/common/common.module.ts` (export SUPABASE_ADMIN, SupabaseJwtService), `src/common/i18n.ts` (LocaleResolver đọc `req.user.locale`), `src/common/openapi.ts` (include admin)

## Implementation steps
1. Cài deps phase 06; env Supabase.
2. `supabase.ts`: port + adapter (service role, server only) + `SupabaseJwtService` (`jwtVerify` với JWKS; lỗi → `AppException(UNAUTHENTICATED)` chung, chi tiết chỉ log debug).
3. `decorators.ts`.
4. `identity.dto.ts` (zod) → `identity.repository.ts` → `identity.service.ts` (`ensureProfile` tx + flag; `getPermissions` cache; `setUserRoles` + `DEL`; `deleteMe` local → Supabase).
5. `auth.guard.ts`, `permission.guard.ts`; đăng ký `APP_GUARD` theo thứ tự trong `app.module.ts`.
6. Controllers `/me` (`@ApiBearerAuth()`), admin (`@RequirePermissions('role:manage')`, `@Body({ schema: SetUserRolesSchema })`, `@Param('id', { schema: z.uuid() })`).
7. Bull Board: thay điều kiện dev bằng `@RequirePermissions('queue:read')` (guard áp qua middleware/route wrapper của Bull Board — nếu không áp được, giữ dev-only và ghi decisions-pending).
8. `dev-token.mjs`, `db-seed-admin.sql`; E2E `auth-me`.

## Todo
- [ ] supabase.ts (SUPABASE_ADMIN port/adapter + JwtService JWKS)
- [ ] decorators.ts
- [ ] identity dto / repository / service (ensureProfile idempotent, perms cache, deleteMe)
- [ ] auth.guard.ts + permission.guard.ts + thứ tự APP_GUARD
- [ ] /me, DELETE /me, admin roles API
- [ ] touchDevice `.catch(log)`
- [ ] Bull Board guard queue:read
- [ ] dev-token.mjs, seed admin, E2E auth-me

## Success criteria
```
curl -s :3000/api/v1/me | jq -e '.error.code=="UNAUTHENTICATED"'
TOKEN=$(node scripts/dev-token.mjs)
curl -s -H "Authorization: Bearer $TOKEN" -H "x-device-id: dev-1" :3000/api/v1/me | jq -e '.data.roles==["user"]'
psql $DATABASE_URL -c "select device_id from devices" | grep dev-1
curl -s -H "Authorization: Bearer $TOKEN" -o /dev/null -w "%{http_code}" :3000/api/v1/admin/roles    # 403
psql $DATABASE_URL -f scripts/db-seed-admin.sql -v uid=$UID && ADMIN_TOKEN=$(node scripts/dev-token.mjs admin@…)
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" -X PUT :3000/api/v1/admin/users/$UID/roles -H 'content-type: application/json' -d '{"roles":["moderator"]}' | jq -e '.data.roles|index("moderator")'
curl -s -H "Authorization: Bearer $TOKEN" -X DELETE -o /dev/null -w "%{http_code}" :3000/api/v1/me   # 204
npm run test:e2e -- auth-me
```

## Risk assessment
| Rủi ro | Phòng |
|---|---|
| JWKS fetch fail (Supabase down) → mọi request 401 | `createRemoteJWKSet` cache; `/health/ready` không phụ thuộc JWKS; log warn |
| Vòng phụ thuộc AuthGuard ↔ IdentityModule | Chuyển `ensureProfile` vào guard dùng `DRIZZLE` trực tiếp (không `forwardRef`) |
| Quyền cache 5 phút thu hồi chậm | `DEL c9:perms:{id}` ngay khi đổi role |
| `deleteUser` Supabase fail sau khi xoá local | Trả 500, gọi lại được (local not-found chấp nhận) |
| Bull Board không nhận guard NestJS | Fallback dev-only + ghi decisions-pending |

## Security considerations
- `SUPABASE_SERVICE_ROLE_KEY` chỉ server, redact log, không vào image.
- Không log token; lỗi verify trả chung `UNAUTHENTICATED`.
- `aud` bắt buộc `authenticated`; từ chối `is_anonymous`.
- `x-device-id` không phải bí mật — chỉ rate limit/push.

## Next steps
→ [phase-07](./phase-07-testing-ci.md): test nền, smoke đa instance, CI.
