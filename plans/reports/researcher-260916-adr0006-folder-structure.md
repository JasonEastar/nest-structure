# ADR-0006 NestJS Folder Structure — Real-World Evaluation

**Date:** 2026-09-16 · **Researcher:** Claude AI · **Source:** Production codebases 2024–2026

## Real-World NestJS Projects Analyzed

### 1. **nestjs-architecture/node-nestjs-structure**
- **URL:** https://github.com/nestjs-architecture/node-nestjs-structure
- Layout: `src/{common/, entity/, feature-modules/}`
- Approach: Global modules (`common/`) + centralized `entity/` root directory
- Global registration: `APP_*` tokens in app.module.ts
- DTOs: colocated in `common/dto/`; entities: centralized

### 2. **CatsMiaow/nestjs-project-structure**
- **URL:** https://github.com/CatsMiaow/nestjs-project-structure
- Layout: `src/{common/, shared/, modules/}`
- `common/` structure: `constants/, decorators/, dto/, filters/, guards/, interceptors/, interfaces/, middleware/, pipes/` (nested, not flat)
- Uses `SharedModule` (non-global) for reusable exports
- Pattern: avoids excessive `@Global()` usage

### 3. **Encore Cloud Best Practices 2026**
- **URL:** https://encore.dev/articles/nestjs-project-structure-best-practices
- Recommended: Feature-based modules (one folder per domain) + `CoreModule` (one-time setup: DB, auth, config) + `SharedModule` (cross-cutting: logger, exceptions, auth guard)
- `@Global()` reserved for 1–3 truly unavoidable modules (logger, exception filter only)
- Global enhancers: `APP_*` tokens in app.module.ts, not decorators

### 4. **Official NestJS Cats Example**
- **URL:** https://docs.nestjs.com/modules
- Structure: `src/{cats/, common/, core/}`
- Pattern: Feature modules + separate `core/` (infrastructure) + `common/` (utilities)
- Global registration: `APP_GUARD`, `APP_FILTER`, `APP_PIPE` tokens in app.module.ts providers

### 5. **Medium Production Patterns (Nairi Abgaryan 2025)**
- **URL:** https://medium.com/@nairi.abgaryan/stop-the-chaos-clean-folder-file-naming-guide-for-backend-nest-js-and-node-331fdc6400cb
- Consensus: `modules/{domain}`, `core/` (infrastructure), `common/` (generic utilities)
- Entities: centralized in `src/entity/` OR per-module depending on FK complexity
- Naming: kebab-case + conventional suffixes (`.service.ts`, `.dto.ts`, `.entity.ts`, `.job.ts`)

## Official NestJS Guidance

**Global Modules** (https://docs.nestjs.com/modules):
- Documentation explicitly states: "Making everything global is NOT recommended."
- Use `@Global()` only for truly unavoidable concerns (config, logging).
- Prefer explicit `imports/exports` arrays for module clarity and dependency tracing.

**DTOs vs. Entities**:
- Keep strictly separate: DTOs in `<feature>/dto/`, entities in `src/entity/` or `<feature>/entities/`.
- Never expose entities directly (API contracts must be protected).

**Naming Conventions**:
- Kebab-case filenames; standard suffixes: `.service.ts`, `.controller.ts`, `.module.ts`, `.dto.ts`, `.entity.ts`, `.schema.ts`, `.constants.ts`, `.jobs.ts`.
- All production codebases follow this convention consistently.

**Global Enhancers**:
- Two patterns: (a) `APP_*` tokens in root module providers; (b) register in `main.ts` via `app.useGlobalGuards/Filters/Pipes()`.
- ADR-0006 uses pattern (a), which is recommended.

## ADR-0006 Pitfalls & Production Mitigations

| Pitfall | ADR-0006 Risk | Real-World Mitigation | Verdict |
|---------|---------------|----------------------|---------|
| Flat `common/` overgrowth (>15–20 files) | High if all guards/pipes in `common/` | Split into `CoreModule` (infrastructure) + `CommonModule` (utilities); move to `common/<concern>/` at 200 LOC | Acceptable with discipline |
| `app.module.ts` dumping ground | Medium; ADR lists 15+ providers | Use organized provider classes; delegate declarations to module providers | Acceptable with organization |
| `@Global()` CommonModule hiding deps | Low; ADR limits to `CommonModule` only | NestJS docs: reserve `@Global()` for 1–3 modules; use explicit imports for visibility | Aligned |
| DB schema in features + FK circular imports | High; colocating `.schema.ts` per module | Centralize `src/entity/` or use event-driven architecture; avoid cross-feature FK relationships | Risky without discipline |
| `.schema.ts`, `.dto.ts`, `.constants.ts` suffixes | Low; ADR uses them | All production codebases use these; no conflicts observed | Aligned |
| `health/` as top-level folder | Low | Production: health checks usually in `common/` or feature module; top-level folders rare | Acceptable, not idiomatic |

## Comparison: ADR-0006 vs. Ecosystem

| Aspect | ADR-0006 | Ecosystem | Assessment |
|--------|----------|-----------|------------|
| Project type | All-in-one `nest new` | Mix: all-in-one + monorepo (rare) | Aligned |
| `src/` layout | 6 top-level folders | 5–7 typical (common/core/shared/modules/entity/config/scripts) | Aligned |
| Infrastructure module | Single `@Global() CommonModule` | CoreModule (not global) + SharedModule (global logger/exceptions only) | Slightly risky: exposes too much globally |
| DTOs + schemas | Per-module colocated | Per-module DTOs + centralized `src/entity/` | Acceptable; FK complexity varies by domain |
| Global enhancers registration | `APP_*` in app.module.ts | `APP_*` in app.module.ts OR `main.ts` | Aligned |
| Naming convention | Kebab-case + standard suffixes | Identical | Aligned |
| Monorepo with `libs/` | Rejected | Rare in small teams; justified deferral | Aligned |

## Key Findings

1. **ADR-0006 aligns with 2024–2026 production patterns** for small teams (1–2 people).
2. **Risk: Infrastructure overload.** Single `CommonModule` with 12+ providers (database, Redis, queue, auth, logger, I18n, etc.) violates "make everything global sparingly" guidance. Mitigation: split into `CoreModule` (non-global) + `SharedModule` (global logger/exceptions only) when the module grows.
3. **Risk: Schema colocating with features.** If PIN or future modules have FK relationships, circular imports will occur. Mitigation: establish clear rules (e.g., "no cross-module FK") or centralize `src/entity/` early.
4. **Unilateral: naming suffixes, APP_* registration, feature-based modules—all production-standard.**
5. **Deferred correctly:** Monorepo + `libs/contracts` makes sense only when multi-team scaling or separate mobile TypeScript SDK required. Current `openapi.json` export is sufficient.

---

## Kết luận cho ADR-0006

ADR-0006 là hợp lý cho giai đoạn hiện tại (team 1–2 người, không monorepo). Cấu trúc tuân theo công cụ NestJS chính thức và thực tế sản xuất 2024–2026. Ba rủi ro chính: (1) `CommonModule` @Global() chứa quá nhiều concern — tách `CoreModule` khi vượt 200 LOC; (2) schema colocate ở feature modules có nguy cơ FK tuần hoàn — thiết lập quy tắc rõ hoặc tập trung `src/entity/`; (3) app.module.ts sẽ lớn dần — dùng provider classes để tổ chức. Không cần monorepo/libs ngay bây giờ. **Khuyến cáo:** áp dụng ADR-0006 nhưng lập kế hoạch refactor (CoreModule tách riêng) ở sprint 3–4.

---

## Unresolved Questions

1. **Cross-module FK handling:** Khi nào nên tập trung `src/entity/` vs. cho phép per-module colocating? Tiêu chí là gì (số bảng? độ phức tạp quan hệ)?
2. **`CommonModule` scale point:** Chính xác ở bao nhiêu providers (12? 15? 20?) thì nên tách CoreModule?
3. **Health checks placement:** Có cần top-level `health/` folder hay nên di chuyển vào `common/health/` khi ADR-0006 được áp dụng?
4. **Exception filter + Logger `@Global()`:** Hai concern này có nên ở CommonModule hay tách riêng SharedModule?
5. **API vs. Worker segregation timing:** Tiêu chí push fan-out nào (request count? latency p95?) để chuyển sang multi-process sau này?

### Sources
- https://docs.nestjs.com/modules
- https://docs.nestjs.com/fundamentals/circular-dependency
- https://encore.dev/articles/nestjs-project-structure-best-practices
- https://github.com/nestjs-architecture/node-nestjs-structure
- https://github.com/CatsMiaow/nestjs-project-structure
- https://medium.com/@nairi.abgaryan/stop-the-chaos-clean-folder-file-naming-guide-for-backend-nest-js-and-node-331fdc6400cb
