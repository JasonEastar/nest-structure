# Bắt Đầu Nhanh - Tích Hợp ClaudeKit vào Project

## 🎯 Yêu Cầu Trước Khi Bắt Đầu

### 1. Kiểm tra Claude Code đã cài đặt
```bash
# Check version
claude --version

# Nếu chưa có, cài đặt từ:
# https://code.claude.ai/download
```

### 2. Có project code của bạn
```bash
cd /path/to/your-project
ls -la
# Project của bạn ở đây
```

## 🚀 Cách 1: Tích Hợp ClaudeKit vào Project Hiện Tại (Recommended)

### Bước 1: Copy ClaudeKit files vào project

```bash
# Giả sử ClaudeKit source ở ~/Downloads/claudekit-engineer-main
# Và project của bạn ở ~/my-awesome-project

cd ~/my-awesome-project

# Copy toàn bộ .claude directory
cp -r ~/Downloads/claudekit-engineer-main/.claude .

# Copy .opencode directory (optional nhưng recommended)
cp -r ~/Downloads/claudekit-engineer-main/.opencode .

# Copy CLAUDE.md để customize
cp ~/Downloads/claudekit-engineer-main/CLAUDE.md .

# Tạo thư mục docs nếu chưa có
mkdir -p docs

# Copy docs templates
cp ~/Downloads/claudekit-engineer-main/docs/code-standards.md docs/
cp ~/Downloads/claudekit-engineer-main/docs/codebase-summary.md docs/
```

### Bước 2: Customize CLAUDE.md cho project của bạn

Mở `CLAUDE.md` và sửa:

```markdown
# CLAUDE.md

## Project Overview
[Tên project của bạn] - [Mô tả ngắn gọn]

## Tech Stack
- Backend: [Express.js / FastAPI / Laravel / ...]
- Frontend: [React / Vue / Angular / ...]
- Database: [PostgreSQL / MySQL / MongoDB / ...]
- [Các tech khác...]

## Essential Commands

### Development
npm run dev          # Start dev server (hoặc yarn dev, pnpm dev)
npm run build        # Build production
npm test            # Run tests

### Database (nếu có)
npm run db:migrate   # Run migrations
npm run db:seed      # Seed data

### [Thêm commands khác của project]

## Project Structure
\`\`\`
src/
├── api/           # API routes
├── components/    # React components
├── services/      # Business logic
├── models/        # Database models
└── utils/         # Utilities

[Mô tả structure của bạn]
\`\`\`

## Coding Standards

### API Routes
- Format: /api/v1/resource
- [Conventions của bạn]

### Database
- ORM: [Prisma / TypeORM / Mongoose / ...]
- Naming: snake_case for tables
- [Rules của bạn]

### Testing
- Framework: [Jest / Vitest / Pytest / ...]
- Coverage: aim for >80%
- [Standards của bạn]
```

### Bước 3: Customize workflows

```bash
# Edit development rules
nano .claude/workflows/development-rules.md
```

Thêm project-specific rules:

```markdown
## Project-Specific Rules

### Database Operations
- Always use [your ORM] for queries
- Migration files: YYYYMMDD_description.sql
- Never commit .env file

### API Development
- All endpoints need authentication
- Response format: { success, data, error }
- Use [your validation library]

### Frontend
- Component naming: PascalCase
- Hooks prefix: use[Name]
- State management: [Redux / Zustand / Context]

### Git Workflow
- Branch naming: feature/description, fix/description
- Commit format: conventional commits
- PR requires 1 approval
```

### Bước 4: (Optional) Create project-specific skill

```bash
# Tạo skill cho domain của bạn
mkdir -p .claude/skills/my-project-domain
```

`.claude/skills/my-project-domain/SKILL.md`:

```markdown
---
name: my-project-domain
description: Domain knowledge for [your project type]
---

## Domain Context
[Ví dụ: E-commerce / CRM / Healthcare / Finance / ...]

## Key Patterns

### Authentication Flow
1. User login → JWT token
2. Store in httpOnly cookie
3. Verify middleware on protected routes

### Data Models
- User: id, email, role, created_at
- [Other models...]

### Business Rules
- [Important business logic]
- [Edge cases to consider]

## Common Tasks

### Add new API endpoint
1. Create route in src/api/[resource].ts
2. Add controller in src/controllers/
3. Update OpenAPI docs
4. Write tests

### Add new database table
1. Create migration: npm run db:create [name]
2. Define schema in prisma/schema.prisma
3. Run migration: npm run db:migrate
4. Update types: npm run db:generate
```

### Bước 5: Start coding với Claude!

```bash
# Trong project directory
cd ~/my-awesome-project

# Khởi động Claude Code
claude

# Hoặc skip permissions (cẩn thận!)
# claude --dangerously-skip-permissions
```

## 💻 Sử Dụng Với Claude Code

### Test basic workflow

```bash
# Trong Claude Code prompt:

# 1. Xem codebase structure
"Analyze the project structure and create a codebase summary"

# 2. Plan một feature mới
/plan "add user profile page with avatar upload"

# 3. Implement theo plan
/cook "implement the user profile feature"

# 4. Run tests
/test

# 5. Fix issues nếu có
/fix "authentication not working in profile page"

# 6. Commit changes
/git:cm
```

### Workflow thực tế

**Scenario 1: Thêm feature mới**

```bash
# Claude Code session:

You: "I need to add a payment integration with Stripe"

# Claude sẽ:
1. Activate `payment-integration` skill
2. Ask clarifying questions
3. Spawn `planner` agent → create plan in ./plans/
4. Ask for approval
5. Implement step-by-step
6. Run tests
7. Review code
8. Update docs
9. Commit
```

**Scenario 2: Fix bug**

```bash
You: "Users can't login, error in console"

# Claude sẽ:
1. Ask for error details / logs
2. Use `debugger` agent to analyze
3. Create fix plan
4. Implement fix
5. Test thoroughly
6. Commit with descriptive message
```

**Scenario 3: Refactor code**

```bash
You: "/plan refactor authentication to use JWT instead of sessions"

# Claude sẽ:
1. Analyze current auth implementation
2. Research JWT best practices
3. Create detailed migration plan
4. Ask for approval
5. You: "proceed"
6. Implement gradually
7. Test each step
8. Update docs
```

## 🎨 Vibe Coding Tips

### 1. Conversation-based coding

```bash
# Natural language
You: "Create a dashboard page showing user statistics"

# Claude hiểu và làm:
- Create React component
- Fetch data from API
- Add charts/visualizations
- Style with Tailwind/CSS
- Write tests
- Update routing
```

### 2. Iterative refinement

```bash
You: "Make the dashboard more visually appealing"
Claude: [Improves UI/UX]

You: "Add real-time updates"
Claude: [Implements WebSocket]

You: "Optimize for mobile"
Claude: [Adds responsive design]
```

### 3. Leverage slash commands

```bash
# Quick fixes
/fix:fast "button not working"

# Deep planning
/plan:hard "migrate to microservices architecture"

# Auto mode (trust me bro)
/cook:auto "add social login with Google and Facebook"
```

### 4. Use skills effectively

```bash
# When working with databases
You: "Optimize these slow queries"
# Claude activates `databases` skill

# When working with UI
You: "Design a beautiful login page"
# Claude activates `aesthetic` + `frontend-design` skills

# When need research
You: "What's the best way to implement real-time notifications?"
# Claude spawns `researcher` agents
```

## 🔧 Troubleshooting

### Issue 1: Claude không nhận ClaudeKit commands

```bash
# Check .claude directory tồn tại
ls -la .claude/

# Restart Claude Code
# Exit và start lại: claude
```

### Issue 2: Commands không work

```bash
# Check settings.json
cat .claude/settings.json

# Check hooks có executable permissions
chmod +x .claude/hooks/*.sh
chmod +x .claude/hooks/*.js
```

### Issue 3: Agents không spawn

```bash
# Check .opencode directory
ls -la .opencode/agent/

# Verify agent files có format đúng
head .opencode/agent/planner.md
```

### Issue 4: Skills không activate

```bash
# Check skills directory
ls -la .claude/skills/

# Verify SKILL.md files
find .claude/skills -name "SKILL.md"
```

## 📊 Workflow Optimization

### Giảm token usage

```bash
# 1. Update codebase-summary.md định kỳ
You: "Update codebase summary"

# 2. Use progressive disclosure
/plan:fast  # Thay vì /plan:hard khi không cần research sâu

# 3. Clear instructions
You: "Follow pattern in src/components/UserCard.tsx"
# Thay vì: "Create similar to other components"
```

### Speed up development

```bash
# 1. Use auto modes cho simple tasks
/cook:auto:fast "add API endpoint for getting user list"

# 2. Parallel work
You: "Add these features in parallel: user profile, notifications, settings"
# Claude spawns multiple agents

# 3. Reuse patterns
You: "Create similar component to UserCard but for Products"
```

## 🎯 Best Practices

### 1. Start session với context

```bash
You: "I'm working on [feature X] in [file Y].
      Current status: [describe].
      Need to: [goal]."
```

### 2. Incremental changes

```bash
# Tốt
You: "Add login form"
You: "Add validation"
You: "Add error handling"

# Tránh
You: "Build entire authentication system"
```

### 3. Review trước khi commit

```bash
You: "Review changes before committing"
# Claude shows diff và explains changes
You: "Looks good, commit"
```

### 4. Keep docs updated

```bash
# After major changes
You: "/docs"
# Claude updates all documentation
```

## 🚀 Next Steps

1. **Test basic flow**: Plan → Implement → Test
2. **Customize workflows** cho project pattern
3. **Create shortcuts** cho common tasks
4. **Build skill library** cho domain
5. **Refine prompts** based on results

## 📝 Checklist Tích Hợp Thành Công

- [ ] Copied .claude/ directory
- [ ] Copied .opencode/ directory
- [ ] Customized CLAUDE.md với project info
- [ ] Updated development-rules.md
- [ ] Tested `/plan` command
- [ ] Tested `/cook` command
- [ ] Tested `/test` command
- [ ] Created first feature với ClaudeKit
- [ ] Committed changes với `/git:cm`
- [ ] Documented workflow cho team

---

**Bắt đầu vibe coding ngay! 🎉**
