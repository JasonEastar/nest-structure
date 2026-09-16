# Setup Chi Tiết - Tích Hợp ClaudeKit

## 📋 Các Bước Setup Đầy Đủ

### Bước 1: Copy ClaudeKit vào Project

```bash
# Định nghĩa paths
CLAUDEKIT_SOURCE=~/Downloads/claudekit-engineer-main
YOUR_PROJECT=~/your-awesome-project

cd $YOUR_PROJECT

# Copy core files
cp -r $CLAUDEKIT_SOURCE/.claude .
cp -r $CLAUDEKIT_SOURCE/.opencode .
cp $CLAUDEKIT_SOURCE/CLAUDE.md .

# Copy templates
mkdir -p docs plans
cp $CLAUDEKIT_SOURCE/docs/code-standards.md docs/
cp $CLAUDEKIT_SOURCE/docs/codebase-summary.md docs/

# Copy workflows
cp -r $CLAUDEKIT_SOURCE/.claude/workflows .claude/
```

### Bước 2: Customize Project Context

#### 2.1. Update `CLAUDE.md`

```markdown
# CLAUDE.md

## Project Overview
[Project name] - [Brief description]
Production URL: [if applicable]
Team size: [number]

## Tech Stack

### Backend
- Language: [Node.js 18+ / Python 3.11+ / Go 1.21+ / ...]
- Framework: [Express / FastAPI / Gin / Laravel / ...]
- Database: [PostgreSQL 15 / MongoDB 6 / ...]
- Cache: [Redis / Memcached / ...]
- Queue: [Bull / Celery / RabbitMQ / ...]

### Frontend
- Framework: [React 18 / Vue 3 / Next.js 14 / ...]
- State: [Redux / Zustand / Pinia / ...]
- Styling: [Tailwind / MUI / styled-components / ...]
- Build: [Vite / Webpack / ...]

### DevOps
- CI/CD: [GitHub Actions / GitLab CI / Jenkins / ...]
- Hosting: [AWS / GCP / Vercel / Railway / ...]
- Monitoring: [Sentry / DataDog / ...]

## Essential Commands

### Development
\`\`\`bash
npm run dev              # Start dev server on :3000
npm run dev:api          # API server only on :4000
npm run dev:web          # Web server only on :3000
\`\`\`

### Database
\`\`\`bash
npm run db:migrate       # Run migrations
npm run db:rollback      # Rollback last migration
npm run db:seed          # Seed test data
npm run db:reset         # Reset database
\`\`\`

### Testing
\`\`\`bash
npm test                 # Run all tests
npm run test:unit        # Unit tests only
npm run test:e2e         # E2E tests
npm run test:watch       # Watch mode
\`\`\`

### Build & Deploy
\`\`\`bash
npm run build            # Production build
npm run deploy:staging   # Deploy to staging
npm run deploy:prod      # Deploy to production
\`\`\`

## Project Structure
\`\`\`
src/
├── api/              # API routes & controllers
├── services/         # Business logic
├── models/           # Database models
├── middleware/       # Express middleware
├── utils/            # Utility functions
├── types/            # TypeScript types
└── config/           # Configuration files
\`\`\`

## Important Conventions

### File Naming
- Components: PascalCase (UserProfile.tsx)
- Utils/Services: camelCase (authService.ts)
- Hooks: use prefix (useAuth.ts)

### API Routes
- Format: /api/v1/resource
- Authentication: JWT in Authorization header
- Response: { success, data, error, meta }

### Database
- Tables: snake_case (user_profiles)
- Foreign keys: {table}_id (user_id)
- Timestamps: created_at, updated_at
```

#### 2.2. Customize Development Rules

Edit `.claude/workflows/development-rules.md`:

```markdown
## Project-Specific Rules

### Authentication
- Use JWT tokens with 24h expiry
- Refresh tokens stored in httpOnly cookies
- All API routes require authentication except /auth/*

### Database
- Always use transactions for multi-table updates
- Index all foreign keys
- Soft delete with deleted_at column

### Error Handling
- Use custom error classes (AppError, ValidationError)
- Log all errors to Sentry
- Return user-friendly messages

### Testing
- Coverage requirement: >80%
- E2E tests for critical flows
- Mock external APIs in tests

### Git Workflow
- Branch naming: feature/ABC-123-description
- Conventional commits required
- Squash merge to main
- PR requires CI pass + 1 approval
```

### Bước 3: Create Project-Specific Skill

```bash
mkdir -p .claude/skills/project-domain
```

Create `.claude/skills/project-domain/SKILL.md`:

```markdown
---
name: project-domain
description: Domain knowledge for [your project]
---

## Domain Context
[E-commerce / SaaS / Healthcare / Finance / Social Media / ...]

## Key Business Rules

### User Management
- Email verification required
- Password: min 8 chars, 1 uppercase, 1 number
- Max 5 login attempts before lockout

### Payment Processing
- Support Stripe and PayPal
- Webhook retry: 3 attempts with exponential backoff
- Refund window: 30 days

### Data Retention
- User data: 7 years after account deletion
- Logs: 90 days retention
- Analytics: aggregated, anonymized

## Common Patterns

### API Endpoint Template
\`\`\`typescript
// src/api/v1/users.ts
import { Router } from 'express';
import { authenticate } from '@/middleware/auth';
import { validate } from '@/middleware/validate';
import { userSchema } from '@/schemas';

const router = Router();

router.get('/', authenticate, async (req, res) => {
  // Implementation
});

export default router;
\`\`\`

### Service Pattern
\`\`\`typescript
// src/services/userService.ts
export class UserService {
  async create(data: CreateUserDto) {
    // Validate
    // Transform
    // Save to DB
    // Return
  }
}
\`\`\`
```

### Bước 4: Configure MCP Servers (Optional)

Edit `.claude/.mcp.json`:

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

### Bước 5: Setup Gemini Skills (Optional)

```bash
# Copy .env example
cp .claude/.env.example .claude/.env

# Edit and add your key
nano .claude/.env
```

Add:
```
GEMINI_API_KEY=your-api-key-here
```

Get key from: https://aistudio.google.com/apikey

### Bước 6: Test Installation

```bash
# Start Claude Code
claude

# Test commands
/plan "test feature"
/test
/docs
```

## 🎯 Verification Checklist

- [ ] `.claude/` directory exists
- [ ] `.opencode/` directory exists
- [ ] `CLAUDE.md` customized with project info
- [ ] `development-rules.md` updated
- [ ] Project-specific skill created
- [ ] MCP servers configured (if using)
- [ ] Gemini API key set (if using)
- [ ] `/plan` command works
- [ ] `/cook` command works
- [ ] `/test` command works
- [ ] Agents can spawn successfully

## 🔧 Post-Setup Configuration

### Enable Hooks (Optional)

```bash
# Make hooks executable
chmod +x .claude/hooks/*.sh
chmod +x .claude/hooks/*.js

# Test hooks
echo '{"tool_name":"Write","tool_input":{"file_path":"test.txt"}}' | node .claude/hooks/modularization-hook.js
```

### Configure Statusline (Optional)

```bash
# Test statusline
node .claude/statusline.js
```

### Setup Notifications (Optional)

```bash
# Discord webhook
nano .claude/hooks/.env
# Add: DISCORD_WEBHOOK_URL=your-webhook-url

# Test
bash .claude/hooks/discord_notify.sh "Test message"
```

## 📚 Next Steps

1. Read [Usage Guide](./su-dung-nang-cao.md)
2. Try workflow examples
3. Customize for your team
4. Share with teammates
