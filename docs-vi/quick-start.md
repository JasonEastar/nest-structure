# Quick Start - Tích Hợp ClaudeKit (5 phút)

## ✅ Yêu Cầu

```bash
# 1. Check Claude Code đã cài
claude --version

# 2. Vào project của bạn
cd /path/to/your-project
```

## 🚀 3 Bước Tích Hợp

### Bước 1: Copy files (1 phút)

```bash
# Từ ClaudeKit source
CLAUDEKIT_PATH=~/Downloads/claudekit-engineer-main

# Copy vào project
cp -r $CLAUDEKIT_PATH/.claude .
cp -r $CLAUDEKIT_PATH/.opencode .
cp $CLAUDEKIT_PATH/CLAUDE.md .
mkdir -p docs plans
```

### Bước 2: Customize CLAUDE.md (2 phút)

```markdown
# CLAUDE.md

## Project Overview
[Your project name and description]

## Tech Stack
- Backend: [Node.js/Python/Go/PHP/...]
- Frontend: [React/Vue/Angular/...]
- Database: [PostgreSQL/MongoDB/...]

## Essential Commands
npm run dev         # Dev server
npm test           # Run tests
npm run build      # Production build
```

### Bước 3: Start coding (2 phút)

```bash
# Khởi động Claude
claude

# Test workflow
/plan "add user authentication"
```

## 🎯 Commands Thường Dùng

```bash
/plan [task]              # Tạo plan
/cook [task]              # Implement
/fix [issue]              # Fix bugs
/test                     # Run tests
/git:cm                   # Commit
/git:cp                   # Commit & push
```

## 💡 Ví Dụ Sử Dụng

```bash
# Thêm feature
You: "Add login page with email and password"
Claude: [creates plan → implements → tests → commits]

# Fix bug
You: "/fix authentication not working"
Claude: [debugs → fixes → tests → commits]

# Refactor
You: "/plan refactor API to use RESTful conventions"
Claude: [analyzes → creates detailed plan]
```

## 📚 Tài Liệu Chi Tiết

- [Setup đầy đủ](./setup-chi-tiet.md)
- [Sử dụng nâng cao](./su-dung-nang-cao.md)
- [Troubleshooting](./troubleshooting.md)
