# NestJS Security & OpenAPI Reference (v12, Sept 2026)

## Security Section

### Authentication
**[https://docs.nestjs.com/security/authentication]**
- `JwtService.signAsync(payload)` signs tokens; `verifyAsync(token)` validates; `JwtModule.register({secret, signOptions})` configures globally
- `CanActivate` interface + `ExecutionContext.switchToHttp().getRequest()` + bearer token extraction: `const [type, token] = authorization?.split(' ') ?? []`
- `@SetMetadata(IS_PUBLIC_KEY, true)` marks public routes; `Reflector.getAllAndOverride()` checks method + class-level metadata; guards attach JWT payload to `request['user']`
- **c9_map uses**: Supabase JWT (ES256) via JWKS verification in global `AuthGuard`; avoids Passport/own issuing because Supabase handles OAuth

### Authorization  
**[https://docs.nestjs.com/security/authorization]**
- Basic RBAC: `enum Role { User, Admin }` + `@Roles(...Role[])` decorator + `RolesGuard` checking `requiredRoles.some(role => user.roles?.includes(role))`
- CASL (attribute-based): `CaslAbilityFactory` builds abilities with conditions like `{authorId: user.id}` enabling fine-grained, data-dependent rules
- Advanced: `@CheckPolicies()` + `PoliciesGuard` accepts policy handlers (functions or `IPolicyHandler` classes), iterating to verify all return true
- **c9_map uses**: Permission strings (`resource:action`) + `@RequirePermissions()` + `PermissionsGuard` with Redis 5-min cache; simpler than CASL for c9_map's straightforward ownership/role checks

### Encryption & Hashing
**[https://docs.nestjs.com/security/encryption-hashing]**
- (Content not accessible; refer bcrypt patterns and password security standards elsewhere)

### Helmet
**[https://docs.nestjs.com/security/helmet]**
- Install: `npm i helmet` (Express) or `npm i @fastify/helmet` (Fastify)
- Setup: `app.use(helmet())` (Express) or `app.register(helmet)` (Fastify); **must come before other `app.use()` calls**
- GraphQL: disable CSP with `contentSecurityPolicy: false` or custom directives to avoid Apollo Sandbox conflicts
- **c9_map uses**: Helmet globally; avoids disabling any protections (no GraphQL)

### CORS
**[https://docs.nestjs.com/security/cors]**
- `app.enableCors()` or `NestFactory.create(AppModule, {cors: true})`; accepts optional config object for origins, credentials, methods
- Dynamic config: callback function to define config asynchronously per-request
- Express uses `cors` package; Fastify uses `@fastify/cors`
- **c9_map uses**: Static CORS config (mobile app origin whitelisting); avoids dynamic per-request logic

### CSRF Protection
**[https://docs.nestjs.com/security/csrf]**
- Express: `npm i csrf-csrf`; destructure `{generateToken, doubleCsrfProtection, validateRequest}`; **requires session/`cookie-parser` middleware first**
- Fastify: `npm i @fastify/csrf-protection`; `app.register()` after storage plugin
- Token generation + validation in middleware layer, not per-route
- **c9_map uses**: N/A (stateless JWT auth; mobile app not vulnerable to CSRF)

### Rate Limiting
**[https://docs.nestjs.com/security/rate-limiting]**
- `ThrottlerModule.forRoot([{name, ttl, limit}])` defines throttler sets; `ThrottlerGuard` as `APP_GUARD`
- `@Throttle(name, limit, ttl)` overrides per-endpoint; `@SkipThrottle()` or `@SkipThrottle({throttler: bool})` exempts selectively
- Custom storage via `ThrottlerStorage` interface; Redis support for distributed systems
- Proxy handling: enable `trust proxy` to extract original IP from headers
- **c9_map uses**: `@nestjs/throttler` + Redis storage; `@SkipThrottle()` on internal/health endpoints

## OpenAPI Section

### Introduction
**[https://docs.nestjs.com/openapi/introduction]**
- `new DocumentBuilder()` → `.setTitle()`, `.setDescription()`, `.setVersion()`, `.addTag()` → `.build()` → `SwaggerModule.createDocument(app, config)`
- `SwaggerModule.setup(path, app, documentFactory, options?)` serves UI; access at `http://localhost:3000/api`
- Options: `include` (modules), `extraModels`, `ignoreGlobalPrefix`, `operationIdFactory`, `autoTagControllers`, `standardSchemaConverter`
- **c9_map uses**: Two separate documents (`include: [ModuleA, ModuleB]`) for public/internal APIs; avoids `autoTagControllers` (manual `@ApiTags()`)

### Types & Parameters
**[https://docs.nestjs.com/openapi/types-and-parameters]**
- `@ApiProperty()` + schema options (`type`, `example`, `enum`, `minimum`, `default`); `@ApiPropertyOptional()` shorthand for `required: false`
- `@ApiExtraModels(ExtraModel)` registers non-referenced models; `getSchemaPath(Model)` generates `$ref` for `oneOf/anyOf/allOf` compositions
- Array syntax: `@ApiProperty({type: [String]})` or nested: `{type: 'array', items: {type: 'array', items: {type: 'number'}}}`
- Circular deps: lazy function `type: () => Node`
- **c9_map uses**: `@ApiProperty()` only (no CLI plugin); avoids Zod DTO integration with plugin (manual is simpler for validation)

### Operations
**[https://docs.nestjs.com/openapi/operations]**
- `@ApiTags('cats')` groups endpoints; `@ApiHeader({name, description})` documents headers
- Response decorators: `@ApiResponse()`, `@ApiOkResponse()`, `@ApiCreatedResponse()`, `@ApiBadRequestResponse()` with `type` property
- File upload: `@ApiConsumes('multipart/form-data')` + `@ApiBody()` + DTO property `{type: 'string', format: 'binary'}`
- Advanced: `allOf` with `$ref` for reusable paginated templates; `@ApiExtension()` for custom x-prefixed metadata
- **c9_map uses**: Standard decorators + `allOf` for envelope (`{data: T, meta}`) documentation; no file uploads

### Security
**[https://docs.nestjs.com/openapi/security]**
- Decorators: `@ApiBearerAuth()`, `@ApiBasicAuth()`, `@ApiOAuth2(['scope'])`, `@ApiCookieAuth('session-id')`, `@ApiSecurity(name, config)`
- DocumentBuilder: `.addBearerAuth()`, `.addBasicAuth()`, `.addOAuth2()`, `.addCookieAuth(name)`, `.addSecurity(name, config)`
- Call decorator on controller/method; matching `addXAuth()` in builder before document creation
- **c9_map uses**: `@ApiBearerAuth()` + `.addBearerAuth()` (Supabase ES256 JWT); avoids OAuth2 (Google sign-in handled by Supabase)

### Mapped Types
**[https://docs.nestjs.com/openapi/mapped-types]**
- `PartialType(DTO)` makes all fields optional; `PickType(DTO, ['field1'])` selects fields; `OmitType(DTO, ['field1'])` excludes fields
- `IntersectionType(DTO1, DTO2)` merges both; composable: `PartialType(OmitType(CreateCatDto, ['name']))`
- All from `@nestjs/swagger`; work seamlessly in OpenAPI generation
- **c9_map uses**: `PartialType`, `OmitType` for update DTOs; avoids `IntersectionType` (no polymorphic updates)

### Decorators
**[https://docs.nestjs.com/openapi/decorators]**
- Parameter: `@ApiParam()`, `@ApiQuery()`, `@ApiBody()`, `@ApiHeader()`, `@ApiCookieAuth()`
- Response: `@ApiResponse()`, `@ApiOperation()`, `@ApiTags()`, `@ApiExcludeEndpoint()`, `@ApiExcludeController()`
- Model: `@ApiProperty()`, `@ApiPropertyOptional()`, `@ApiSchema()`, `@ApiHideProperty()`, `@ApiExtraModels()`
- **c9_map uses**: Core set only; avoids rarely-used exclusion/extension decorators

### CLI Plugin
**[https://docs.nestjs.com/openapi/cli-plugin]**
- `nest-cli.json`: `"plugins": ["@nestjs/swagger"]` with optional `options: {classValidatorShim, introspectComments, dtoFileNameSuffix}`
- `classValidatorShim: true` reuses `class-validator` decorators as schema constraints (`@Max(10)` → OpenAPI max)
- `introspectComments: true` extracts JSDoc for property descriptions
- **Zod incompatibility**: Plugin does NOT auto-detect Zod schemas; c9_map's zod DTOs require manual `@ApiProperty()` anyway
- **c9_map uses**: No plugin (nestjs-zod DTOs need manual decoration); avoids plugin overhead

### Other Features
**[https://docs.nestjs.com/openapi/other-features]**
- Global parameters via `DocumentBuilder` (apply to all routes)
- Global responses: `addGlobalResponse(statusCode, {type, description})` for standardized error shapes (401, 500)
- Multiple specs: separate documents on different endpoints; dropdown selector via `swaggerOptions.urls`
- `ignoreGlobalPrefix` excludes `setGlobalPrefix()` from OpenAPI paths
- **c9_map uses**: Global responses for error envelope (`{statusCode, message, timestamp}`); ignores global prefix (routes use full paths)

---

## Recommended RBAC Design for c9_map

**Guard Order in main.ts:**
```typescript
app.useGlobalGuards(new AuthGuard(...), new PermissionsGuard(...), new ThrottlerGuard(...));
// AuthGuard first: verifies JWT, sets request.user; @Public() escape hatch
// PermissionsGuard second: checks request.user against @RequirePermissions(['resource:action'])
// ThrottlerGuard last: rate-limits after auth
```

**Decorators + Database Tables:**
- `@Public()` marks routes (no auth required)
- `@RequirePermissions('users:read', 'posts:create')` checks permission strings
- Tables: `users.role_id` → `roles.id` (name: 'user'|'moderator'|'admin') → `role_permissions.permission_id` → `permissions.name` ('users:read', 'posts:create')
- Cache: Redis hash `permissions:user:{userId}` (5-min TTL); invalidate on role/permission changes

**Ownership Checks:** Enforce in service layer (guard handles RBAC; service validates `resource.user_id === request.user.sub`)

---

## Gotchas

1. **Helmet + Fastify:** Use `@fastify/helmet`, not Express `helmet`; setup order is critical (before `register()` calls).
2. **CORS credentials:** Enabling `credentials: true` requires `origin` to be a function or specific URL, not `*`.
3. **JWT secrets in code:** Never hardcode; use environment variables or vault (`.env` loaded early in bootstrap).
4. **Reflector.getAllAndOverride():** Checks method-level metadata first, then class-level; method overrides class decorator.
5. **Rate limiting proxy:** Without `trust proxy`, throttler uses proxy IP not client IP; Redis state persists across restarts.
6. **CSRF + sessions:** CSRF middleware must load AFTER session/cookie-parser; token validation occurs mid-request.
7. **@ApiProperty() required:** Swagger CLI plugin does NOT auto-detect zod schemas; manual `@ApiProperty()` still needed for nestjs-zod DTOs.
8. **Multiple Swagger docs:** Each document needs separate `SwaggerModule.setup()` call; they share same `app` instance but different routes/modules.
9. **Bearer token format:** Guard expects `Authorization: Bearer {token}`, not `Bearer:{token}` or `Token {token}`; splitting on space is brittle for malformed headers.
10. **Permission cache invalidation:** If cache TTL expires mid-request, guard uses stale permissions; implement event-driven invalidation (user role change → Redis DELETE).
