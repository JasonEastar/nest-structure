# Hướng Dẫn Setup Local - ClaudeKit Engineer

## ⚙️ Config Local - Tối Ưu Cho Dự Án

### Bước 1: Clone/Copy Template

```bash
# Copy ClaudeKit Engineer template
cp -r claudekit-engineer-main my-project

cd my-project
```

### Bước 2: Tối Ưu Settings (`.claude/settings.json`)

```json
{
  "includeCoAuthoredBy": false,
  "statusLine": {
    "type": "command",
    "command": "node .claude/statusline.js",
    "padding": 0
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{
          "type": "command",
          "command": "node \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/scout-block.js"
        }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [{
          "type": "command",
          "command": "node \"$CLAUDE_PROJECT_DIR\"/.claude/hooks/modularization-hook.js"
        }]
      }
    ]
  }
}
```

### Bước 3: Customize Project Context (`CLAUDE.md`)

```markdown
# CLAUDE.md

## Project Overview
[Mô tả dự án của bạn]

## Tech Stack
- Backend: Node.js/Python/Go
- Frontend: React/Vue/Next.js
- Database: PostgreSQL/MongoDB

## Essential Commands
npm run dev          # Development server
npm test            # Run tests
npm run build       # Production build

## Project-Specific Rules
- [Custom rules cho project]
```

### Bước 4: Customize Workflows (`.claude/workflows/`)

**Tùy chỉnh `development-rules.md`**:

```markdown
## Project-Specific Rules

### Database
- Always use Prisma ORM
- Migration naming: YYYYMMDD_description

### API Design
- RESTful conventions
- Versioning: /api/v1/

### Frontend
- Component structure: atoms → molecules → organisms
- State management: Zustand
```

### Bước 5: Customize Agents (`.opencode/agent/`)

**Ví dụ: Custom `planner.md`**:

```markdown
---
name: planner
description: Custom planner for [your project type]
---

## Additional Context
- Tech stack: [your stack]
- Architecture: [your architecture]
- Deployment: [your platform]

## Custom Workflow
1. Check existing [your specific files]
2. Follow [your coding standards]
3. Consider [your constraints]
```

### Bước 6: Create Custom Skills (`.claude/skills/`)

**Ví dụ: Project-specific skill**

```bash
mkdir .claude/skills/my-project-skill
```

`.claude/skills/my-project-skill/SKILL.md`:

```markdown
---
name: my-project-skill
description: Domain-specific knowledge for [project]
---

## When to Use
- [Specific scenarios]

## Knowledge Base
- [Project conventions]
- [API patterns]
- [Database schemas]

## References
[Link to project docs]
```

### Bước 7: Optimize Prompts cho Dự Án

**Create custom slash commands**:

`.claude/commands/my-feature.md`:

```markdown
---
description: ⚡ Implement [specific feature type]
argument-hint: [details]
---

## Context
This project uses [tech stack].
Follow patterns in [specific files].

## Workflow
1. Check existing [components]
2. Use [your libraries]
3. Follow [your conventions]

## Specific Instructions
- Database: Use [your ORM]
- API: Follow [your patterns]
- Testing: Use [your framework]
```

## 🔧 Debugging & Monitoring

### Enable Debug Mode

```bash
# Hook debugging
export MODULARIZATION_HOOK_DEBUG=true
```

### Monitor Agent Activity

```bash
# Check plans directory
ls -la plans/

# Check latest plan
cat plans/$(ls -t plans/ | head -1)/plan.md
```

### Analyze Token Usage

```bash
# Count lines in plans
find plans/ -name "*.md" -exec wc -l {} \;
```

## 📝 Checklist Setup Local

- [ ] Copy template to project
- [ ] Update `CLAUDE.md` with project context
- [ ] Customize `.claude/workflows/development-rules.md`
- [ ] Update tech stack in agents
- [ ] Create project-specific skills
- [ ] Add custom slash commands
- [ ] Configure hooks if needed
- [ ] Set up MCP servers (`.claude/.mcp.json`)
- [ ] Configure Gemini API key for AI skills
- [ ] Test with simple task

## 🎓 Ví Dụ Thực Tế

### Scenario: E-commerce Project

**1. Update `CLAUDE.md`**:
```markdown
## Tech Stack
- Next.js 14, React, TypeScript
- Prisma + PostgreSQL
- Stripe payments
- AWS S3 storage

## Commands
npm run dev         # http://localhost:3000
npm run db:push     # Push schema changes
npm run stripe:test # Test Stripe webhooks
```

**2. Custom skill**: `.claude/skills/ecommerce/SKILL.md`
```markdown
## E-commerce Patterns
- Cart: Redis session store
- Orders: Event-driven (order-created, order-paid)
- Products: Cached in Redis, invalidate on update
```

**3. Custom command**: `.claude/commands/add-product.md`
```markdown
---
description: Add new product feature
---

## Workflow
1. Create Prisma schema
2. Generate types: npm run db:push
3. Create API route: /api/products
4. Create React components
5. Add to dashboard
```

## 💡 Tips Tối Ưu

### 1. Project-Specific Context
Càng nhiều context cụ thể về project → agents càng hiệu quả

### 2. Reusable Commands
Tạo slash commands cho common tasks trong project

### 3. Skill Library
Build up skill library theo thời gian cho domain của bạn

### 4. Iterative Refinement
Test và refine workflows based on actual usage

### 5. Documentation First
Maintain good docs → agents làm việc tốt hơn
