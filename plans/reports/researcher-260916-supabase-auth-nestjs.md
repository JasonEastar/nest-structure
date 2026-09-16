# Supabase Auth Integration for NestJS 11 Modular-Monolith API

**Date:** 2026-09-16 | **Recency:** September 2026 | **Target:** Vietnamese consumer map app

## 1. JWT Verification in NestJS

**JWKS Endpoint:** `https://<project-id>.supabase.co/auth/v1/.well-known/jwks.json` returns asymmetric signing keys. Supabase issues ES256 JWTs by default (supports RS256/HS256 legacy).

**Recommended Library:** `jose` (TypeScript-native, modern). Alternative: `passport-jwt` + `jwks-rsa` (more complex setup).

**Access Token Claims:** `sub` (user UUID), `role` (authenticated/anon/service_role), `aud` (authenticated/anon), `session_id` (unique per session), `is_anonymous` (boolean), `aal` (aal1=single-factor, aal2=MFA), `amr` (array of auth methods used), `exp` (expiration timestamp), `iat` (issued-at).

**Token Lifetime:** Default 3600 seconds (1 hour), configurable via `auth.jwt_expiry` in config.toml, max 604,800s (7 days).

**Refresh Token Rotation:** Enabled by default. Config key: `auth.enable_refresh_token_rotation` (boolean, true/false). Reuse detection prevents token replay.

**Key Rotation:** Supabase rotates signing keys periodically; `kid` (key ID) present in JWKS. Most JWT libraries auto-cache JWKS.

**Avoid:** SUPABASE_JWT_SECRET (HS256 shared secret)—use JWKS verification instead (security risk, harder to detect compromise).

## 2. Custom Access Token Hook & Auth Hooks

**Five Auth Hooks:**
- Custom Access Token: Inject claims before JWT issuance
- Send SMS: Route to custom SMS provider
- Send Email: Custom email sending
- MFA Verification Attempt: Accept/reject MFA challenge
- Password Verification Attempt: Enforce password policy

**Implementation:** HTTP POST endpoints OR Postgres functions (`pg-functions://postgres/<schema>/<function_name>`).

**Config Keys (config.toml):**
```
[auth.hook.custom_access_token]
enabled = true
uri = "https://your-api.com/hooks/access-token" | "pg-functions://postgres/public/custom_access_token_hook"
```

**SMS Hook:** Can integrate Vietnamese providers (eSMS.vn, SpeedSMS, Twilio, Messagebird, Textlocal, Vonage). Built-in Supabase SMS provider included; hook bypasses for custom routing.

**Cost/Limits:** Supabase built-in SMS ~$0.06 per SMS; Vietnamese providers vary ($0.01–0.03 per SMS). HTTP hooks subject to rate limits (TBD per Supabase tier).

## 3. Email OTP / Magic Link

**Default Expiry:** 1 hour (3600 seconds). Rate limit: once per 60 seconds per user.

**Config Keys:**
- `auth.email.otp_length` (6–10, default 6)
- `auth.email.otp_expiry` (default 3600 seconds)
- Magic links use same expiry as OTP

**SMTP:** Supabase provides Mailpit (local dev). Production requires custom SMTP (Resend, SES, SendGrid). Default rate limits unknown; likely 1000+/hour for Pro tier.

**Test OTP (config.toml):** `auth.sms.test_otp = "4152127777 = \"123456\""` simulates SMS in dev.

## 4. Social Login

**Providers:** Google, Apple, Facebook (+ GitHub, Azure, GitLab, Twitter, Discord).

**Account Linking:** Identities stored in `auth.identities` junction table. Manual linking via `link_identity()` method. Flag: `auth.enable_linked_identities`.

**Setup:** Requires OAuth credentials (client ID/secret) entered in Dashboard > Authentication > Providers.

## 5. Data Model

**Split Architecture:**
- `auth.users` (Supabase-managed): email, phone, encrypted password, MFA, last_sign_in
- `public.profiles` (app-managed): full name, avatar, roles, permissions, Vietnamese preferences

**Sync Pattern:** DB trigger on `auth.users` INSERT → auto-insert `public.profiles` row. OR app-side upsert on first login. Both viable.

**Keys:**
- `service_role` key: Server-only, bypasses RLS (dangerous if exposed)
- `anon` key: Browser-safe, enforces RLS

**RLS Recommended:** Yes, even with NestJS as sole DB client—defense in depth prevents app bugs from exposing user data.

## 6. Supabase Postgres + Drizzle ORM

**PostGIS:** Available via Postgres extension (not confirmed in local Docker image; verify with `SELECT extname FROM pg_extension`).

**Connection Strings:**
- Direct: `postgres://user:pass@db.supabase.co:5432/postgres` (long-running servers)
- Supavisor (session pooler): `postgres://...@db.supabase.co:6543/postgres`
- Supavisor (transaction pooler): `postgres://...@db.supabase.co:6543/postgres` (requires `prepare: false` in Drizzle)

**Drizzle Config:**
```typescript
const client = postgres(DATABASE_URL, { prepare: false }); // transaction mode
const db = drizzle({ client });
```

**Migrations:** `drizzle-kit push:pg` with migrations folder under `drizzle/`.

**Pricing (2026):** Free ($0), Pro ($25/mo, 500MB), Team ($599/mo, 100GB). PITR/backups in Pro+.

## 7. Local Development

**`supabase start` Services:**
- API Gateway: 54321
- PostgreSQL: 54322
- Studio UI: 54323
- Mailpit (SMTP test): 54324

**config.toml Auth Keys:**
```
[auth]
site_url = "http://localhost:3000"
jwt_expiry = 3600
enable_signup = true
enable_refresh_token_rotation = true

[auth.sms.test_otp]
"4152127777" = "123456"

[auth.email]
otp_length = 6
otp_expiry = 3600
```

**External Docker-Compose:** Use `host.docker.internal` to reach host services from Supabase containers.

**PostGIS in Local:** Not explicitly documented; install manually or use custom Dockerfile.

**Known Issue:** `supabase_vector_supabase-playground` container breaks. Fix: `analytics.enabled = false` in config.toml.

## 8. Admin Operations

**supabase-js Admin API:**
```typescript
await supabase.auth.admin.createUser({ email, password, autoConfirmEmail: true })
await supabase.auth.admin.deleteUser(userId) // cascades to sessions
await supabase.auth.admin.generateLink({ type: 'signup', email })
await supabase.auth.admin.updateUserById(userId, { user_metadata })
await supabase.auth.admin.inviteUserByEmail(email)
await supabase.auth.admin.signOut(userId) // sign out from all sessions
```

**GoTrue Admin REST:** Alternative to supabase-js (HTTP-based). Uses `service_role` key header.

**Cascading Deletion:** User deletion removes related sessions automatically.

**Security:** Never expose `service_role` key in browser.

## 9. Known Pitfalls

- **Clock Skew:** Server clock must sync with Supabase (~5s tolerance). Use NTP.
- **`aud` Mismatch:** JWT `aud` claim must match expected value (usually `authenticated`).
- **Token Size:** Custom claims inflate JWT; deeply nested metadata can exceed rate limits.
- **Rate Limits:** Auth endpoints throttled per IP (exact limits TBD per Supabase support).
- **Anonymous Sign-Ins:** Session tracked via `auth.sessions` table with device fingerprinting (`x-device-id` header).
- **Force Device Sign-Out:** Delete row from `auth.sessions` table for specific `session_id`.

---

## Recommendation for c9_map

Use **Jose + JWKS verification** for NestJS, **Send SMS Hook** (integrate Vietnamese SMS provider), **RLS + public.profiles** for data isolation, **Drizzle ORM + transaction-mode pooling** (prepare: false), **local supabase start** with mock SMS/email in dev. Enable refresh token rotation. For admin ops, wrap supabase-js calls in NestJS guards. Expect ~$25–50/mo Supabase + $100–300/mo SMS at scale.

---

## Unresolved Questions

1. Exact rate limits per Supabase tier (auth endpoints, SMTP, admin API)?
2. PostGIS included in local `supabase start` Docker image?
3. Recommended Vietnamese SMS provider (eSMS.vn vs SpeedSMS vs custom Twilio)?
4. Token size limits with custom claims—where does rejection occur?
5. GoTrue admin REST endpoint documentation (separate from supabase-js)?

---

## Sources

- [Supabase JWT Documentation](https://supabase.com/docs/guides/auth/jwts)
- [Supabase JWT Claims Reference](https://supabase.com/docs/guides/auth/jwt-fields)
- [Supabase JWT Signing Keys](https://supabase.com/docs/guides/auth/signing-keys)
- [Supabase Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks)
- [Custom Access Token Hook](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook)
- [Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook)
- [Passwordless Email Sign-In](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [Drizzle ORM - Supabase Connection](https://orm.drizzle.team/docs/connect-supabase)
- [Supabase CLI Getting Started](https://supabase.com/docs/guides/local-development/cli/getting-started)
- [Supabase CLI Configuration](https://supabase.com/docs/guides/local-development/cli/config)
- [Medium: JWT Verification in NestJS](https://medium.com/@kloselyc/from-401-to-green-properly-verifying-supabase-jwt-in-nestjs-fb611c521939)
- [Supabase Admin API Reference](https://supabase.com/docs/reference/javascript/auth-admin-createuser)
