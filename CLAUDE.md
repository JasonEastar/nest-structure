# CLAUDE.md

## ⚠️ Dự án này: c9_map (C9 Map backend) — ĐỌC TRƯỚC

- **Là gì:** API backend (NestJS 12 modular monolith, đa instance) cho bản đồ đời sống thời gian thực TP.HCM. Mobile là repo riêng, chỉ dùng OpenAPI.
- **Stack đã chốt, KHÔNG mở lại:** Supabase Auth (chỉ auth, Google) + PostgreSQL 16/PostGIS riêng (ADR-0005), Drizzle, Redis 7 (cache · throttler · BullMQ), zod 4 qua `StandardSchemaValidationPipe` (có sẵn trong Nest 12), Swagger/OpenAPI (`@nestjs/swagger`, đọc schema zod tự động), một project NestJS all-in-one, không APP_ROLE, cấu trúc: `src/{config,common/{auth,database,redis,http},modules/<x>/{dto,schema}}`, test ở `test/{unit,integration,setup}` (ADR-0006 + sửa đổi 2026-09-17; cây đầy đủ ở `docs/code-standards.md` §3), nestjs-i18n, R2, FCM. Không WebSocket. Xem `docs/system-architecture.md` §2 và `docs/adr/`.
- **MUST đọc trước khi làm:** `docs/code-walkthrough.md` (đọc code từ đâu, file nào làm gì, request đi qua đâu), `docs/api-cookbook.md` (cách viết một API: tên, input, zod, response, lỗi, Swagger), `docs/nestjs-guide.md` (cách dùng NestJS 12 đúng docs, gotchas), `docs/code-standards.md` (nguyên tắc bất biến MUST/NEVER — vi phạm là bug), `docs/project-roadmap.md` (làm từng bước, dừng review), `docs/decisions-pending.md` (quyết định chưa chốt → dùng khuyến nghị tạm, hỏi khi chạm tới).
- **NEVER** thêm dependency, xoá file, sửa schema DB, hoặc thêm tính năng ngoài bước đang làm mà không hỏi. Sau mỗi bước: liệt kê file tạo/sửa + chạy lệnh "done".
- **Tự vấn khi viết bất kỳ biến nào:** "Instance 2 có cần biết cái này không?" Có → Redis hoặc Postgres, không RAM.
- **Skill theo agent (bắt buộc kích hoạt):**
  | Agent | Skill |
  |---|---|
  | main agent khi viết code NestJS, `code-reviewer`, `planner` | `nestjs-best-practices` (đọc kèm `docs/nestjs-guide.md` §12 — bảng ngoại lệ của dự án thắng skill), `backend-development` |
  | `database-admin`, khi làm schema/migration/PostGIS | `databases` |
  | `debugger`, `tester` khi test đỏ | `debugging`, `nestjs-best-practices` (mục test-*) |
  | `researcher` | `docs-seeker`, `research` |
  | `docs-manager`, `project-manager` | `planning` (đọc `docs/code-standards.md` §6 trước khi viết tài liệu) |
- **Tài liệu:** chỉ trong `docs/` theo quy chuẩn `docs/code-standards.md` §6 (kebab-case, tiếng Việt, header meta). `guide/`, `docs-vi/` là tài liệu ClaudeKit, không phải của dự án.

---

## ClaudeKit Engineer (boilerplate workflow)

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Boilerplate Overview

ClaudeKit Engineer is a comprehensive boilerplate for building professional software with AI-powered agent orchestration. It leverages Claude Code and Open Code CLI agents for automated development workflows.

## Essential Commands

### Testing & Quality
```bash
npm test          # unit + integration (Vitest, tự dựng PostGIS + Redis bằng testcontainers)
npm run lint      # oxlint
npm run typecheck # tsc --noEmit
```
Danh sách lệnh đầy đủ: [README](./README.md#lệnh).

### Git Workflow
- Conventional commits (feat, fix, docs, refactor, perf, test, build, ci, chore). Header ≤ 100 ký tự, subject lower-case.
- Commit một lần cho mỗi tính năng hoàn chỉnh (code + test + docs), không commit vụn.

### Date Formatting
```bash
# Get YYMMDD format for documentation
date +%y%m%d                    # macOS/Linux
Get-Date -UFormat "%y%m%d"      # Windows PowerShell
```

## Architecture & Workflows

### Agent Orchestration System

The project uses a multi-agent architecture coordinated through workflows:

**Core Workflows** (`.claude/workflows/`):
- `primary-workflow.md` - Main development cycle (planning → implementation → testing → review)
- `development-rules.md` - Coding standards and principles (YANGI, KISS, DRY)
- `orchestration-protocol.md` - Sequential chaining and parallel execution patterns
- `documentation-management.md` - Documentation sync protocols

**Agent Roles** (`.opencode/agent/`):
- `planner.md` - Creates implementation plans, spawns researcher agents
- `researcher.md` - Investigates technologies and approaches
- `tester.md` - Runs tests, analyzes coverage and failures
- `code-reviewer.md` - Reviews code quality, security, standards
- `debugger.md` - Analyzes logs, CI/CD failures, performance issues
- `docs-manager.md` - Maintains synchronized documentation
- `git-manager.md` - Creates conventional commits and PRs
- `project-manager.md` - Tracks progress and milestones

### Orchestration Patterns

**Sequential Chaining** - Use when tasks have dependencies:
```
Planning → Implementation → Testing → Review → Documentation
```

**Parallel Execution** - Use for independent tasks:
```
Multiple researcher agents investigating different approaches
Separate feature branches with no file conflicts
Cross-platform implementations (iOS/Android)
```

### Development Workflow

1. **Planning Phase**
   - Delegate to `planner` agent to create implementation plan in `./plans/`
   - Planner spawns multiple `researcher` agents in parallel for technical investigation
   - Plan includes TODO tasks and architectural decisions

2. **Implementation Phase**
   - Follow the plan created by planner agent
   - Write clean, maintainable code following established patterns
   - Handle edge cases and error scenarios
   - **DO NOT** create new enhanced files - update existing files directly
   - Run compile/build commands after code changes to check for errors

3. **Testing Phase**
   - Delegate to `tester` agent to run tests and analyze results
   - **DO NOT** use fake data, mocks, or cheats to pass tests
   - Fix failing tests following recommendations
   - Only mark tasks complete when all tests pass

4. **Code Review Phase**
   - Delegate to `code-reviewer` agent after implementation
   - Address security vulnerabilities and performance issues
   - Follow coding standards from `./docs/code-standards.md`

5. **Documentation Phase**
   - Delegate to `docs-manager` agent to update `./docs/` directory
   - Ensure documentation reflects implementation changes

## File Organization

### Key Configuration Files
- `CLAUDE.md` - Project-specific Claude Code instructions (this file)
- `.claude/settings.json` - Claude Code settings
- `.claude/metadata.json` - Project metadata for releases
- `.claude/.mcp.json` - Model Context Protocol server configurations
- `.commitlintrc.json` - Commit message linting rules
- `.releaserc.json` - Semantic release configuration

### Directory Structure
```
.claude/
├── agents/           # Agent definitions
├── commands/         # Slash commands (e.g., /plan, /cook, /fix)
├── hooks/            # Git hooks
├── skills/           # Reusable knowledge modules
└── workflows/        # Development workflows

.opencode/
├── agent/            # OpenCode agent configurations
└── command/          # OpenCode command definitions

docs/
├── code-standards.md          # Coding standards and conventions
├── codebase-summary.md        # Auto-generated codebase overview
├── project-overview-pdr.md    # Product requirements
├── project-roadmap.md         # Development roadmap
└── system-architecture.md     # Architecture documentation

plans/
├── reports/          # Agent-to-agent communication
└── templates/        # Reusable plan templates
```

## Coding Standards

### Core Principles
- **YANGI** - You Aren't Gonna Need It (avoid over-engineering)
- **KISS** - Keep It Simple, Stupid (prefer simple solutions)
- **DRY** - Don't Repeat Yourself (eliminate duplication)

### File Naming
- Use **kebab-case** for all file names
- Descriptive names that indicate file purpose without reading content
- Keep code files under 200 lines for optimal context management
- Split large files into focused components/modules

### Code Quality
- Read and follow standards in `./docs/code-standards.md`
- Prioritize functionality and readability over strict style enforcement
- Use try-catch error handling and follow security standards
- No confidential information (API keys, credentials) in repository

### Pre-commit/Push Rules
- Run linting before commit
- Run tests before push
- **DO NOT** ignore failing tests to pass builds
- Create clean, professional commit messages without AI references
- Use conventional commit format

## Skills System

The `.claude/skills/` directory contains specialized knowledge modules:

**Key Skills**:
- `aesthetic` - UI/UX design principles and implementation
- `ai-multimodal` - Google Gemini API for image/video/audio/document processing
- `backend-development` - Node.js, Python, Go, Rust backend patterns
- `better-auth` - Authentication and authorization framework
- `chrome-devtools` - Browser automation with Puppeteer
- `databases` - MongoDB and PostgreSQL management
- `debugging` - Systematic debugging framework
- `devops` - Cloudflare, Docker, GCP deployment
- `docs-seeker` - Search technical documentation (llms.txt sources)
- `frontend-design` - Production-grade frontend interfaces
- `frontend-development` - React/TypeScript modern patterns
- `mcp-builder` - Create MCP servers
- `mcp-management` - Manage MCP servers and tools
- `sequential-thinking` - Structured problem-solving

**Gemini Skills Configuration**:
- Require `GEMINI_API_KEY` in environment or `.env` files
- Priority order: env var → project `.env` → `.claude/.env` → `.claude/skills/.env` → skill-specific `.env`
- Get API key: https://aistudio.google.com/apikey
- Supports Vertex AI with `GEMINI_USE_VERTEX=true`

## Model Context Protocol (MCP)

Configure MCP servers in `.claude/.mcp.json`:

**Example Configurations**:
```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp", "--api-key", "YOUR_API_KEY"]
    },
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest"]
    }
  }
}
```

## Important Reminders

1. **MUST READ** workflows in `.claude/workflows/` before implementing features
2. **MUST FOLLOW** development rules in `.claude/workflows/development-rules.md`
3. **ALWAYS** read `./README.md` first for project context
4. **NEVER** ignore failing tests just to pass builds or CI/CD
5. **DO NOT** create mock/fake implementations - always write real code
6. Sacrifice grammar for concision in reports
7. List unresolved questions at end of reports
8. Use `docs-seeker` skill for latest plugin/package documentation
9. Use `gh` command for GitHub interactions
10. Use `psql` command for Postgres debugging
11. Use `ai-multimodal` skill for image/video/document analysis

## Related Projects

When working with ClaudeKit ecosystem:
- `claudekit` - ClaudeKit website (../claudekit)
- `claudekit-marketing` - Marketing kit (../claudekit-marketing)
- `claudekit-cli` - CLI tool for project setup (../claudekit-cli)
- `claudekit-docs` - Public documentation (../claudekit-docs)

## Documentation Structure

All critical documentation lives in `./docs/`:
- `project-overview-pdr.md` - Product requirements and goals
- `code-standards.md` - Coding standards and file organization
- `codebase-summary.md` - High-level codebase overview
- `system-architecture.md` - Architecture and component interactions
- `project-roadmap.md` - Development milestones and timeline
