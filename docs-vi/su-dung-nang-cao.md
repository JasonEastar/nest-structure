# Sử Dụng Nâng Cao - ClaudeKit Engineer

## 🎯 Workflow Patterns

### Pattern 1: Feature Development (Step-by-step)

```bash
# Session 1: Planning
You: "/plan add user profile page with avatar upload and bio"

Claude:
1. Spawns researcher agents (parallel)
   - Research file upload best practices
   - Research image processing libraries
   - Research form validation patterns
2. Creates detailed plan in ./plans/YYMMDD-HHMM-user-profile/
3. Asks for approval

# Session 2: Implementation
You: "/cook implement user profile feature"

Claude:
1. Follows plan step-by-step
2. Creates components, API routes
3. Implements file upload
4. Adds validation
5. Runs type checking

# Session 3: Testing
You: "/test"

Claude:
1. Spawns tester agent
2. Runs all tests
3. Reports failures (if any)

# Session 4: Fix & Review
You: "/fix issues from test report"

Claude:
1. Fixes failing tests
2. Spawns code-reviewer agent
3. Addresses code quality issues
4. Re-runs tests

# Session 5: Documentation & Commit
You: "/docs"
You: "/git:cm"

Claude:
1. Updates documentation
2. Creates conventional commit
3. Reports summary
```

### Pattern 2: Auto Mode (Trust Me Bro)

```bash
# For simple, well-defined tasks
You: "/cook:auto add API endpoint for user statistics"

Claude:
1. Quick analysis (no detailed plan)
2. Implements immediately
3. Tests
4. Reviews
5. Commits
# All in one go!

# For very fast iteration
You: "/cook:auto:fast add search functionality"

Claude:
1. Scout codebase
2. Quick plan
3. Implement
4. Done!
# Fastest mode
```

### Pattern 3: Bug Fixing Workflow

```bash
# Scenario: Production bug
You: "/debug users can't upload images over 2MB"

Claude:
1. Spawns debugger agent
2. Analyzes logs, code
3. Identifies root cause
4. Creates fix plan

You: "/fix:fast apply the fix"

Claude:
1. Implements fix
2. Tests thoroughly
3. Asks for approval

You: "looks good, commit and deploy"

You: "/git:cp"
# Commits and pushes
```

### Pattern 4: Parallel Development

```bash
You: "I need these features in parallel:
      1. User notifications system
      2. Dashboard analytics
      3. Export data to CSV"

Claude:
1. Spawns 3 planner agents (parallel)
2. Each creates independent plan
3. Checks for conflicts
4. Asks for approval on all 3

You: "approve all"

Claude:
1. Implements feature 1
2. Tests & commits
3. Implements feature 2
4. Tests & commits
5. Implements feature 3
6. Tests & commits
# Sequential implementation to avoid conflicts
```

## 🎨 Advanced Prompting Techniques

### 1. Context-Rich Requests

```bash
❌ BAD:
"Add authentication"

✅ GOOD:
"Add JWT authentication following the pattern in src/auth/sessionAuth.ts
 but using tokens instead of sessions. Store refresh tokens in Redis.
 Add rate limiting for login attempts."
```

### 2. Reference Existing Code

```bash
"Create similar component to UserCard (src/components/UserCard.tsx)
 but for displaying product information. Use the same styling
 approach and data fetching pattern."
```

### 3. Specify Constraints

```bash
"Implement image upload with these requirements:
 - Max size: 5MB
 - Formats: jpg, png, webp only
 - Store in AWS S3, not local filesystem
 - Generate thumbnails: 100x100, 300x300
 - Use existing imageService (src/services/imageService.ts)"
```

### 4. Iterative Refinement

```bash
# First pass
You: "Create login page"
Claude: [creates basic login]

# Refinement 1
You: "Add social login (Google, Facebook)"
Claude: [adds OAuth]

# Refinement 2
You: "Add 2FA option"
Claude: [adds TOTP]

# Refinement 3
You: "Make it mobile responsive and add animations"
Claude: [improves UI/UX]
```

## 🔧 Custom Commands

### Create Project-Specific Command

`.claude/commands/add-crud.md`:

```markdown
---
description: ⚡ Add CRUD for resource
argument-hint: [resource-name]
---

## Task
Create complete CRUD operations for: $ARGUMENTS

## Workflow
1. Read project structure from docs/codebase-summary.md
2. Create database migration for [resource]_table
3. Create Prisma model (or your ORM)
4. Generate TypeScript types
5. Create API routes:
   - GET    /api/v1/[resource]
   - GET    /api/v1/[resource]/:id
   - POST   /api/v1/[resource]
   - PUT    /api/v1/[resource]/:id
   - DELETE /api/v1/[resource]/:id
6. Add validation schemas
7. Create service layer
8. Add authentication middleware
9. Write tests for all endpoints
10. Update API documentation

## Standards
- Follow patterns in src/api/v1/users.ts
- Use validation from src/middleware/validate.ts
- Follow error handling in src/utils/errors.ts
```

Usage:
```bash
/add-crud products
# Creates full CRUD for products
```

## 🎯 Skills Activation Strategies

### Auto-Activation

Claude automatically activates relevant skills:

```bash
You: "Optimize database queries"
→ Activates: databases, debugging

You: "Design beautiful landing page"
→ Activates: aesthetic, frontend-design, ui-styling

You: "Add Stripe payments"
→ Activates: payment-integration, backend-development

You: "Fix CI/CD pipeline"
→ Activates: devops, debugging
```

### Manual Activation

```bash
# Explicitly request skill
You: "Use the sequential-thinking skill to analyze
      this performance bottleneck"

You: "Use ai-multimodal skill to analyze this error screenshot"

You: "Use docs-seeker skill to find latest Next.js 14 docs"
```

## 📊 Optimization Techniques

### 1. Reduce Token Usage

```bash
# Use references instead of copying code
You: "Follow same pattern as UserService"
# Instead of: "Here's the code: [paste 200 lines]"

# Update codebase summary periodically
You: "Update docs/codebase-summary.md"
# Helps Claude understand structure faster

# Use progressive disclosure
/plan:fast    # Instead of /plan:hard when appropriate
```

### 2. Parallel Execution

```bash
# Research multiple options at once
You: "/plan:two compare REST API vs GraphQL for our use case"
→ Claude creates 2 parallel plans for comparison

# Multiple agents working
You: "Analyze performance issues"
→ Spawns: debugger + databases + devops agents in parallel
```

### 3. Caching Context

```markdown
# In CLAUDE.md, add common patterns
## Common Patterns

### API Response Format
\`\`\`typescript
{ success: boolean, data: T, error?: string, meta?: Pagination }
\`\`\`

### Error Handling
\`\`\`typescript
throw new AppError('Message', 400);
\`\`\`

Claude reads this once and reuses throughout session
```

## 🚀 Team Workflows

### Setup for Team

1. **Commit ClaudeKit to repo**
```bash
git add .claude .opencode CLAUDE.md
git commit -m "feat: add ClaudeKit setup"
git push
```

2. **Team onboarding doc**
```markdown
# Team Setup

## For new members:
1. Install Claude Code: https://code.claude.ai
2. Clone repo: git clone ...
3. Install deps: npm install
4. Start: claude

## Commands everyone should know:
- /plan: Create feature plan
- /cook: Implement feature
- /fix: Fix bugs
- /test: Run tests
- /git:cm: Commit
```

3. **Shared skills**
```bash
# Team creates shared skills in .claude/skills/
.claude/skills/company-api-patterns/
.claude/skills/company-testing-standards/
.claude/skills/company-security-rules/
```

## 🔍 Debugging & Troubleshooting

### Enable Verbose Mode

```bash
# Set debug flags
export MODULARIZATION_HOOK_DEBUG=true
export CLAUDE_DEBUG=true

# Run Claude
claude
```

### Check Agent Communication

```bash
# Monitor plans directory
watch -n 1 'ls -lt plans/ | head -20'

# Check latest report
cat plans/$(ls -t plans/ | head -1)/reports/*.md
```

### Analyze Performance

```bash
# Count LOC in plans
find plans/ -name "*.md" -exec wc -l {} \; | sort -n

# Check token-heavy files
find . -name "*.md" -exec wc -l {} \; | sort -rn | head -20
```

## 💡 Pro Tips

1. **Always provide context**
   ```bash
   "I'm working on [feature] in [file]. Need to [goal]."
   ```

2. **Use plan review**
   ```bash
   You: "/plan [feature]"
   Claude: [creates plan]
   You: "The approach looks good but let's use [alternative]"
   Claude: [updates plan]
   You: "Perfect, proceed"
   ```

3. **Commit frequently**
   ```bash
   # After each logical unit
   You: "/git:cm"
   # Easy to rollback if needed
   ```

4. **Keep sessions focused**
   ```bash
   # One feature per session
   # Complex features → multiple sessions
   ```

5. **Document as you go**
   ```bash
   # After major changes
   You: "/docs"
   # Keeps docs fresh
   ```
