# Troubleshooting - ClaudeKit Engineer

## ❌ Common Issues & Solutions

### Issue 1: Claude không nhận commands

**Symptoms:**
```bash
You: "/plan something"
Claude: "I don't have access to that command"
```

**Solutions:**

1. **Check .claude directory tồn tại**
```bash
ls -la .claude/commands/
# Should show plan.md, cook.md, fix.md, etc.
```

2. **Restart Claude Code**
```bash
# Exit current session (Ctrl+C or type 'exit')
# Start fresh
claude
```

3. **Verify file structure**
```bash
.claude/
├── commands/
│   ├── plan.md      ✓
│   ├── cook.md      ✓
│   └── fix.md       ✓
```

### Issue 2: Agents không spawn

**Symptoms:**
```bash
You: "/plan feature"
Claude: Creates plan but không call planner agent
```

**Solutions:**

1. **Check .opencode directory**
```bash
ls -la .opencode/agent/
# Should show planner.md, tester.md, etc.
```

2. **Verify agent file format**
```bash
head .opencode/agent/planner.md
# Should start with:
# ---
# name: planner
# description: ...
# ---
```

3. **Check permissions**
```bash
chmod 644 .opencode/agent/*.md
```

### Issue 3: Hooks không chạy

**Symptoms:**
- Không có warnings về file size
- Scout commands không blocked

**Solutions:**

1. **Check hooks config**
```bash
cat .claude/settings.json
# Verify hooks section exists
```

2. **Make hooks executable**
```bash
chmod +x .claude/hooks/*.sh
chmod +x .claude/hooks/*.js
```

3. **Test hooks manually**
```bash
# Test modularization hook
echo '{"tool_name":"Write","tool_input":{"file_path":"test.txt"}}' | \
  node .claude/hooks/modularization-hook.js

# Should output JSON with suggestions
```

4. **Check Node.js version**
```bash
node --version
# Should be v18+
```

### Issue 4: Skills không activate

**Symptoms:**
```bash
You: "Use ai-multimodal skill"
Claude: "I don't have that skill"
```

**Solutions:**

1. **Verify skills directory**
```bash
ls -la .claude/skills/
# Should show 30+ skill directories
```

2. **Check SKILL.md exists**
```bash
find .claude/skills -name "SKILL.md"
# Should list all skill definitions
```

3. **For Gemini skills**
```bash
# Check API key
cat .claude/.env | grep GEMINI_API_KEY

# Or set in environment
export GEMINI_API_KEY=your-key-here
```

### Issue 5: Plans không được tạo

**Symptoms:**
```bash
You: "/plan feature"
Claude: Responds but không tạo plan file
```

**Solutions:**

1. **Create plans directory**
```bash
mkdir -p plans/reports plans/templates
```

2. **Check write permissions**
```bash
chmod 755 plans
```

3. **Verify planner agent config**
```bash
cat .opencode/agent/planner.md
# Check workflow section
```

### Issue 6: Git commands không work

**Symptoms:**
```bash
You: "/git:cm"
Claude: Error or does nothing
```

**Solutions:**

1. **Check git-manager agent**
```bash
cat .opencode/agent/git-manager.md
```

2. **Verify git installed**
```bash
git --version
```

3. **Check git config**
```bash
git config user.name
git config user.email
# Should be set
```

4. **Check repository status**
```bash
git status
# Should be in a git repo
```

### Issue 7: MCP servers không connect

**Symptoms:**
- Context7 queries fail
- Chrome DevTools không work

**Solutions:**

1. **Check .mcp.json**
```bash
cat .claude/.mcp.json
# Verify JSON format
```

2. **Test MCP server manually**
```bash
# For context7
npx -y @upstash/context7-mcp --api-key YOUR_KEY

# For chrome-devtools
npx -y chrome-devtools-mcp@latest
```

3. **Check API keys**
```bash
# In .mcp.json, verify API keys are set
```

### Issue 8: Tests fail unexpectedly

**Symptoms:**
```bash
You: "/test"
Claude: Many tests fail that were passing before
```

**Solutions:**

1. **Clear cache**
```bash
# Jest
npm test -- --clearCache

# Vitest
rm -rf node_modules/.vitest
```

2. **Check dependencies**
```bash
npm install  # or yarn, pnpm
```

3. **Run tests manually**
```bash
npm test -- --verbose
# See detailed error messages
```

### Issue 9: Performance issues

**Symptoms:**
- Claude takes too long to respond
- High token usage warnings

**Solutions:**

1. **Update codebase summary**
```bash
You: "Update docs/codebase-summary.md with current structure"
```

2. **Use faster commands**
```bash
/plan:fast      # Instead of /plan:hard
/fix:fast       # Instead of /fix
/cook:auto:fast # Instead of /cook
```

3. **Clear old plans**
```bash
# Archive old plans
mkdir -p plans/archive/2024
mv plans/2024* plans/archive/2024/
```

4. **Reduce file sizes**
```bash
# Find large files
find . -name "*.md" -size +100k

# Split if needed
```

## 🔍 Debugging Workflows

### Enable Debug Mode

```bash
# Set debug environment variables
export MODULARIZATION_HOOK_DEBUG=true
export CLAUDE_DEBUG=true
export DEBUG=*

# Run Claude
claude
```

### Check Logs

```bash
# Claude Code logs (if available)
tail -f ~/.claude-code/logs/debug.log

# System logs
# macOS
tail -f ~/Library/Logs/claude-code/

# Linux
tail -f ~/.local/share/claude-code/logs/
```

### Validate Configuration

```bash
# Check all critical files
ls -la CLAUDE.md
ls -la .claude/settings.json
ls -la .claude/commands/
ls -la .opencode/agent/

# Validate JSON files
cat .claude/settings.json | jq .
cat .claude/.mcp.json | jq .
```

### Test Components Individually

```bash
# Test statusline
node .claude/statusline.js

# Test hooks
echo '{"tool_name":"Bash","tool_input":{"command":"ls node_modules"}}' | \
  node .claude/hooks/scout-block.js

# Test commands
cat .claude/commands/plan.md
```

## 🆘 Getting Help

### Check Documentation

1. **Local docs**
```bash
cat docs-vi/README.md
cat docs-vi/setup-chi-tiet.md
```

2. **Official docs**
- Claude Code: https://docs.claude.com/code
- Open Code: https://opencode.ai/docs

### Community Support

1. **GitHub Issues**
```bash
# Check existing issues
https://github.com/truongtv22/claudekit-engineer/issues
```

2. **Claude Code Discord**
- Join: https://discord.gg/claude-code

### Collect Debug Info

When asking for help, provide:

```markdown
## Environment
- OS: [macOS 14.0 / Ubuntu 22.04 / Windows 11]
- Claude Code version: [claude --version]
- Node.js version: [node --version]
- Project type: [Node.js / Python / Go / ...]

## Issue
[Describe the problem]

## Steps to Reproduce
1. Run command: /plan feature
2. Error occurs: [error message]

## Expected Behavior
[What should happen]

## Actual Behavior
[What actually happens]

## Logs
\`\`\`
[Paste relevant logs]
\`\`\`

## Configuration
\`\`\`json
// .claude/settings.json (remove sensitive data)
\`\`\`
```

## 💡 Prevention Tips

1. **Regular validation**
```bash
# Weekly check
ls -la .claude/ .opencode/
git status .claude/
```

2. **Keep dependencies updated**
```bash
npm outdated
npm update
```

3. **Backup configuration**
```bash
# Backup before major changes
tar -czf claudekit-backup-$(date +%Y%m%d).tar.gz .claude .opencode CLAUDE.md
```

4. **Version control**
```bash
# Commit ClaudeKit changes
git add .claude .opencode CLAUDE.md
git commit -m "chore: update ClaudeKit config"
```

5. **Document customizations**
```markdown
# In CLAUDE.md
## Customizations
- Added custom skill: my-domain
- Modified workflow: development-rules.md
- Custom command: /add-crud
```

## ✅ Health Check Checklist

Run this checklist periodically:

```bash
# 1. Files exist
[ -d .claude ] && echo "✓ .claude exists" || echo "✗ Missing .claude"
[ -d .opencode ] && echo "✓ .opencode exists" || echo "✗ Missing .opencode"
[ -f CLAUDE.md ] && echo "✓ CLAUDE.md exists" || echo "✗ Missing CLAUDE.md"

# 2. Commands work
ls .claude/commands/*.md | wc -l  # Should be 20+

# 3. Agents exist
ls .opencode/agent/*.md | wc -l   # Should be 8+

# 4. Skills available
ls -d .claude/skills/*/ | wc -l   # Should be 30+

# 5. Hooks configured
cat .claude/settings.json | grep -q "hooks" && echo "✓ Hooks configured"

# 6. Plans directory ready
[ -d plans ] && echo "✓ Plans directory exists"

# 7. Docs directory ready
[ -d docs ] && echo "✓ Docs directory exists"
```

All checks passing = Healthy ClaudeKit setup! ✅
