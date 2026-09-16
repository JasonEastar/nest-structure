# Tài Liệu Tiếng Việt - ClaudeKit Engineer

## 📚 Tổng Quan

ClaudeKit Engineer là framework orchestration đa-agent cho phát triển phần mềm tự động với Claude Code và Open Code CLI.

## 🚀 Quick Links

### Setup & Getting Started
- 📘 **[Quick Setup](./QUICK-SETUP.md)** - Setup trong 30 giây
- 📗 **[Setup React Native](./setup-react-native.md)** - Hướng dẫn chi tiết cho RN
- 📙 **[Setup Chi Tiết](./setup-chi-tiet.md)** - Setup đầy đủ cho bất kỳ project

### Core Concepts
- 📕 **[Kiến Trúc và Workflow](./kien-truc-va-workflow.md)** - Hiểu cách ClaudeKit hoạt động
- 📔 **[Tối Ưu Prompt](./toi-uu-prompt.md)** - Prompt optimization techniques

### Usage & Advanced
- 📓 **[Sử Dụng Nâng Cao](./su-dung-nang-cao.md)** - Advanced workflows & patterns
- 🔍 **[Phân Tích & Tối Ưu Project](./phan-tich-va-toi-uu-project.md)** - Analyze & optimize toàn bộ project
- 🐛 **[Troubleshooting](./troubleshooting.md)** - Debug & fix issues

### Quick Commands
- ⚡ **[One-Command Analysis](../analyze-project.md)** - Copy/paste để analyze project

## ⚡ Quick Start (3 bước)

### 1. Copy ClaudeKit vào project
```bash
cd ~/Downloads/claudekit-engineer-main
bash setup-react-native.sh ~/path/to/your-project
```

### 2. Start Claude Code
```bash
cd ~/your-project
claude
```

### 3. Test workflow
```bash
/plan "add profile screen"
/cook "implement profile screen"
```

## 🎯 Common Tasks

### Thêm Feature Mới
```bash
You: "/plan add user authentication with JWT"
# Review plan
You: "/cook implement authentication"
You: "/test"
You: "/git:cm"
```

### Phân Tích & Tối Ưu Project
```bash
# Copy command từ analyze-project.md
You: "Perform comprehensive React Native project analysis..."
# Nhận được reports trong docs/ và plans/
# Review và implement theo roadmap
```

### Fix Bug
```bash
You: "/fix:fast login button not working"
# Auto analyze → fix → test → commit
```

### Optimize Performance
```bash
You: "/plan optimize ProductList performance"
You: "/cook implement optimizations"
```

## 📖 Commands Reference

### Planning
```bash
/plan [task]              # Full planning với research
/plan:fast [task]         # Quick plan (no research)
/plan:hard [task]         # Deep research
/plan:two [task]          # Compare 2 approaches
```

### Implementation
```bash
/cook [tasks]             # Step-by-step implementation
/cook:auto [tasks]        # Auto mode
/cook:auto:fast [tasks]   # Fastest mode
```

### Quality & Testing
```bash
/test                     # Run tests
/fix [issue]              # Fix issues
/fix:fast [issue]         # Quick fix
/debug [issue]            # Debug analysis
/review                   # Code review
```

### Documentation & Git
```bash
/docs                     # Update docs
/git:cm                   # Stage & commit
/git:cp                   # Stage, commit & push
/git:pr [branch]          # Create PR
```

## 🎯 Kiến Trúc Overview

```
User Request
    ↓
Main Agent (orchestrator)
    ↓
Slash Commands (/plan, /cook, /fix...)
    ↓
Subagents (planner, tester, reviewer...)
    ↓
Skills (37+ modules)
    ↓
Output (code, tests, docs)
```

## 🔑 Key Features

### 1. Agent Orchestration
- Main agent điều phối subagents
- Fresh context cho mỗi task
- File-based communication

### 2. Optimized Prompts
- Pre-built workflows
- Hierarchical structure
- Token efficient

### 3. Progressive Disclosure
```
plan.md (80 lines overview)
  └─► phase-01.md (200 lines detail)
      └─► reports/*.md (deep research)
```

### 4. Quality Built-in
- Auto testing
- Code review
- Documentation sync
- Git workflow

## 📊 Use Cases

### Project Analysis
```bash
# Comprehensive analysis
You: [Paste from analyze-project.md]

# Generates:
├── docs/codebase-summary.md
├── docs/code-quality-report.md
├── docs/performance-analysis.md
├── docs/security-audit.md
├── plans/optimization-roadmap.md
└── docs/optimization-summary.md
```

### Feature Development
```bash
# Research → Plan → Implement → Test → Review → Commit
/plan "payment integration"
/cook "implement payment"
/test
/git:cm
```

### Refactoring
```bash
/plan "refactor authentication to use JWT"
/cook "migrate to JWT"
/test "verify all auth flows"
```

### Bug Fixing
```bash
/debug "users can't upload images"
/fix:fast "implement the fix"
/test
```

## 🛠️ Customization Levels

### Level 1: Basic (5 min)
```markdown
Update CLAUDE.md:
- Tech stack
- Commands
- Project rules
```

### Level 2: Workflows (15 min)
```markdown
Customize .claude/workflows/:
- development-rules.md
- Project patterns
```

### Level 3: Skills (30 min)
```markdown
Create .claude/skills/my-domain/:
- Domain knowledge
- Common patterns
```

### Level 4: Commands (1 hour)
```markdown
Create .claude/commands/my-feature.md:
- Custom workflows
- Project automation
```

## 📚 Learning Path

### Week 1: Foundations
- ✅ Setup ClaudeKit
- ✅ Test basic workflow
- ✅ Read kiến trúc docs
- ✅ Try /plan, /cook, /test

### Week 2: Customization
- ✅ Update CLAUDE.md
- ✅ Customize workflows
- ✅ Test real features
- ✅ Read setup chi tiết

### Week 3: Optimization
- ✅ Analyze entire project
- ✅ Create optimization roadmap
- ✅ Custom commands
- ✅ Read tối ưu prompt

### Week 4+: Mastery
- ✅ Custom agents
- ✅ Domain skills
- ✅ Team workflows
- ✅ Token optimization

## 💡 Best Practices

### Development
✅ Always test on both platforms (iOS/Android)
✅ Review plans before implementing
✅ Test thoroughly (no mocks!)
✅ Commit frequently
✅ Update docs regularly

### Prompting
✅ Provide context
✅ Reference existing code
✅ Specify constraints
✅ Use iterative refinement
✅ Leverage skills

### Project Health
✅ Run monthly analysis
✅ Track metrics over time
✅ Address critical issues first
✅ Quick wins for momentum
✅ Document improvements

## 🔗 Resources

### Documentation
- [English README](../README.md)
- [CLAUDE.md](../CLAUDE.md)
- [CHANGELOG](../CHANGELOG.md)

### External
- [Claude Code Docs](https://docs.claude.com/code)
- [Open Code Docs](https://opencode.ai/docs)
- [ClaudeKit Website](https://claudekit.cc)

### Community
- [GitHub Issues](https://github.com/truongtv22/claudekit-engineer/issues)
- [Discord](https://discord.gg/claude-code)

## 🎓 Examples

### Real Workflows

**E-commerce App:**
```bash
/plan "add product search with filters"
/cook "implement search feature"
/plan "optimize product list performance"
/cook "implement optimizations"
/test
```

**Social App:**
```bash
/plan "add real-time chat with WebSocket"
/cook "implement chat feature"
/fix "messages not syncing"
/test
```

**Productivity App:**
```bash
/plan "add offline support with sync"
/cook "implement offline mode"
/debug "sync conflicts"
/fix:fast "resolve conflicts"
```

## 📊 Metrics to Track

```markdown
Weekly:
- Code quality issues resolved
- Test coverage %
- Performance improvements

Monthly:
- Bundle size trend
- Technical debt reduction
- Security vulnerabilities

Quarterly:
- Architecture evolution
- Team velocity
- User-facing improvements
```

## 🎯 Quick Reference

### Workflow Steps
```
Plan → Code → Test → Fix → Review → Docs → Commit
```

### Common Patterns
```bash
# Feature end-to-end
/plan → /cook → /test → /git:cm

# Bug fix
/debug → /fix:fast → /test → /git:cp

# Quick task
/cook:auto:fast "simple task"

# Analysis
Paste comprehensive analysis command
Review reports
Implement roadmap
```

## 💬 Support

### Getting Help
1. Check [Troubleshooting](./troubleshooting.md)
2. Search [GitHub Issues](https://github.com/truongtv22/claudekit-engineer/issues)
3. Ask in [Discord](https://discord.gg/claude-code)
4. Create new issue with debug info

### Contributing
- Improve Vietnamese docs
- Share real examples
- Report bugs
- Suggest features

## ⚖️ License

MIT License - see [LICENSE](../LICENSE)

---

**Happy Coding với ClaudeKit Engineer! 🚀**

**Bắt đầu ngay:**
1. [Quick Setup](./QUICK-SETUP.md) - 30 giây
2. [Analyze Project](../analyze-project.md) - Copy/paste command
3. [Advanced Usage](./su-dung-nang-cao.md) - Master workflows
