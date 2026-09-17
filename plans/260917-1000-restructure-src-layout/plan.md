# Plan: Sắp xếp lại cấu trúc src/ và test/ cho gọn, dễ đọc

**Ngày:** 2026-09-17 · **Trạng thái:** ✅ Hoàn thành 2026-09-17 (55/55 test, build, openapi export, Docker build xanh; git nhận 35 rename) · **Ưu tiên:** Cao (làm trước bước 7 pin core để module mới sinh ra đúng chỗ)

## Vấn đề
- `src/common/` 21 file phẳng (kể cả spec) → khó tìm; `src/modules/identity/` 7 file cùng tiền tố `identity.`.
- Không có quy ước thư mục con → module pin sắp tới sẽ lặp lại tình trạng.

## Quyết định (dựa trên quy ước Nest CLI `nest g resource` + rule CRITICAL `arch-feature-modules` của skill nestjs-best-practices)
- **Module:** file chính ở gốc module (`x.module.ts`, `x.controller.ts`, `x.service.ts`, `x.repository.ts`); chỉ 2 thư mục con `dto/` và `schema/` (Drizzle, thay `entities/`). Không tách `controllers/ services/` một-file-một-thư-mục như template.
- **common/:** gom theo mối quan tâm `auth/ database/ redis/ http/`; `logger/i18n/openapi` là cấu hình module → sang `config/`.
- **health/** → `modules/health/` để gốc `src/` chỉ còn `main.ts · app.module.ts · openapi-export.ts · config/ · common/ · modules/`.
- **Test:** rời khỏi `src/` → `test/unit/` (phẳng) · `test/integration/` · `test/setup/`.
- Không đổi tên export, không đổi logic; chỉ đổi vị trí + 2 tên file (`database.ts` → `drizzle.ts`, `redis.ts` → `cache.ts`) + tách `identity.dto.ts` thành `dto/me.dto.ts` + `dto/role.dto.ts`.

## Cấu trúc đích
```
src/
├── main.ts · app.module.ts · openapi-export.ts
├── config/            env.ts · load-env.ts · logger.ts · i18n.ts · openapi.ts
├── common/
│   ├── common.module.ts
│   ├── auth/          auth.guard.ts · permission.guard.ts · supabase.ts · decorators.ts
│   ├── database/      drizzle.ts · schema.ts
│   ├── redis/         cache.ts · queue.ts · throttler.guard.ts · bull-board.ts
│   └── http/          exceptions.ts · response.ts · validation.ts · request-context.middleware.ts · express.d.ts
└── modules/
    ├── health/        health.module.ts · health.controller.ts · health.indicators.ts
    ├── identity/      identity.module.ts · identity.controller.ts · identity-admin.controller.ts · identity.service.ts · identity.repository.ts
    │   ├── dto/       me.dto.ts · role.dto.ts
    │   └── schema/    identity.schema.ts
    └── pin/           pin.module.ts · pin.constants.ts · pin.jobs.ts
test/
├── unit/              env · exceptions · response · validation · drizzle · permission.guard (.spec.ts)
├── integration/       app · cross-cutting · geography · redis-queue · auth-rbac · supabase-real (.spec.ts)
└── setup/             containers.ts · env.ts
```

## Các bước
1. Script `git mv` + rewrite import tương đối (ESM `.js`) tự động → 2. tách dto → 3. vitest/tsconfig → 4. lint · typecheck · test · build · openapi export · Docker build → 5. cập nhật docs (code-standards §1, project-structure-and-flows, codebase-summary, ADR-0006, CLAUDE.md) → 6. review → commit.

## Done khi
`npm run lint && npm run typecheck && npm test && npm run build && npm run openapi:export` xanh; `git status` chỉ toàn rename (git nhận diện ≥ 90 % similarity).
