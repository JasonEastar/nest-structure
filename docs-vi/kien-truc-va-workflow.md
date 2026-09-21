# Kiến Trúc và Workflow của ClaudeKit Engineer

## 📋 Tổng Quan Kiến Trúc

ClaudeKit Engineer là một framework orchestration đa-agent, sử dụng hệ thống phân cấp các AI agents để tự động hóa quy trình phát triển phần mềm.

### Luồng Hoạt Động Chính

```
User Request → Main Agent → Subagents (planner, researcher, tester...) → Implementation → Review → Documentation
```

## 🎯 Các Thành Phần Core

### 1. **Main Agent (General Purpose)**
- Nhận yêu cầu từ user
- Phân tích và chia nhỏ tasks
- Điều phối các subagents
- Tổng hợp kết quả và report

### 2. **Slash Commands** (`.claude/commands/`)
Các lệnh được tối ưu hóa prompt sẵn:

```bash
/plan [task]          # Tạo kế hoạch implementation
  ├── /plan:fast      # Không research, chỉ phân tích nhanh
  ├── /plan:hard      # Research kỹ + multiple approaches
  └── /plan:two       # 2 approaches so sánh

/cook [tasks]         # Implement feature step-by-step
  ├── /cook:auto      # Auto mode (trust me bro)
  └── /cook:auto:fast # Nhanh nhất: scout → plan → implement

/fix [issues]         # Fix bugs/issues
  ├── /fix:fast       # Fix nhanh
  ├── /fix:hard       # Dùng subagents plan & fix
  ├── /fix:ui         # Fix UI issues
  ├── /fix:ci         # Fix CI/CD pipeline
  └── /fix:test       # Fix failed tests

/test                 # Run tests & analyze
/debug [issue]        # Debug issues
/docs                 # Update documentation
/git:cm               # Stage & commit
/git:cp               # Stage, commit & push
/git:pr               # Create pull request
```

### 3. **Subagents** (`.opencode/agent/`)

#### **Planning & Research**
- `planner.md` - Tạo implementation plans, spawn researcher agents
- `researcher.md` - Research technologies, best practices

#### **Implementation & Quality**
- `tester.md` - Run tests, analyze results
- `code-reviewer.md` - Review code quality, security
- `debugger.md` - Analyze logs, CI/CD failures

#### **Documentation & Management**
- `docs-manager.md` - Maintain documentation
- `git-manager.md` - Git operations, conventional commits
- `project-manager.md` - Track progress, roadmaps

### 4. **Skills System** (`.claude/skills/` - 37 skills)
Specialized knowledge modules được activate khi cần:

```
aesthetic, ai-multimodal, backend-development, better-auth,
chrome-devtools, databases, debugging, devops, docs-seeker,
frontend-design, frontend-development, mcp-builder,
mcp-management, sequential-thinking, ...
```

### 5. **Hooks System** (`.claude/hooks/`)

**Pre-Tool Hooks**:
- `scout-block.js` - Block heavy directories (node_modules, .git, dist)

**Post-Tool Hooks**:
- `modularization-hook.js` - Suggest splitting files >200 LOC

## 🔄 Workflow Chi Tiết

### Workflow 1: Feature Development (`/cook`)

```
1. Research Phase
   └─► Spawn multiple researcher agents in parallel
       ├─► Research approach A
       ├─► Research approach B
       └─► Research approach C

2. Planning Phase
   └─► planner agent analyzes research reports
       └─► Create plan in ./plans/YYYYMMDD-HHmm-plan-name/
           ├─► plan.md (overview, <80 lines)
           ├─► phase-01-phase-name.md
           ├─► phase-02-phase-name.md
           └─► reports/ (agent communications)

3. Implementation Phase
   └─► Main agent follows plan
       ├─► Read codebase standards
       ├─► Implement step-by-step
       ├─► Run compile/type checks
       └─► Use ui-ux-designer for frontend

4. Testing Phase
   └─► tester agent runs tests
       ├─► No mocks/fake data
       ├─► If failed → debugger agent
       └─► Loop until all pass

5. Code Review Phase
   └─► code-reviewer agent reviews
       └─► If issues → fix & re-test

6. Documentation Phase
   └─► docs-manager updates ./docs/
       ├─► codebase-summary.md
       ├─► code-standards.md
       └─► system-architecture.md

7. Project Management
   └─► project-manager updates
       ├─► Plan progress
       └─► project-roadmap.md
```

### Workflow 2: Bug Fixing (`/fix`)

```
1. Debug Analysis
   └─► debugger agent analyzes
       ├─► Read logs
       ├─► Analyze CI/CD failures
       └─► Identify root cause

2. Plan Fix
   └─► planner creates fix plan

3. Implement Fix
   └─► Main agent implements

4. Test & Verify
   └─► tester validates fix
```

## 📊 Token Usage Optimization

### Agent Communication Strategy

**BAD** (high token usage):
```
Main Agent → Subagent → Report back inline
(Toàn bộ context trong 1 conversation)
```

**GOOD** (low token usage):
```
Main Agent → Spawn Subagent (fresh context)
Subagent → Write report to file
Main Agent → Read report file
```

### Progressive Disclosure

```
Level 1: plan.md (overview, 80 lines)
└─► High-level phases, links

Level 2: phase-XX.md (detailed, 200 lines)
└─► Context, requirements, steps

Level 3: reports/XX-report.md (research)
└─► Deep dive, citations, analysis
```
