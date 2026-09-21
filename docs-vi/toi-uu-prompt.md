# Tối Ưu Prompt trong ClaudeKit

## 🎨 Chiến Lược Tối Ưu Prompt

### 1. **Hierarchical Prompt Structure**

Mỗi slash command là một **optimized prompt template**:

```markdown
---
description: ⚡⚡⚡ Intelligent plan creation
argument-hint: [task]
---

## Your mission
<task>$ARGUMENTS</task>

## Workflow
- Step 1...
- Step 2...

## Important Notes
- IMPORTANT: ...
```

### 2. **Agent-Specific Prompts**

Mỗi agent có prompt riêng tối ưu cho vai trò:

```markdown
---
name: planner
description: Research, analyze, create plans
---

You are an expert planner...

## Core Responsibilities
1. Research & Analysis
2. Codebase Understanding
3. Solution Design
4. Plan Creation

## Output Requirements
- DO NOT implement code
- Create markdown plans
- Include trade-offs
```

### 3. **Progressive Disclosure**

Plans được tổ chức theo phases để giảm token usage:

```
plan.md (overview, 80 lines)
├─► Links to phase files
phase-01.md (detailed)
├─► Context, Requirements, Architecture
├─► Implementation Steps
└─► TODO, Success Criteria
```

### 4. **Context Management**

```
1. Codebase Context (read once)
   └─► ./docs/codebase-summary.md
   └─► ./docs/code-standards.md

2. Agent Communication (via files)
   └─► ./plans/*/reports/*.md

3. Fresh Context (prevent degradation)
   └─► Subagents có context riêng
   └─► Report back qua files
```

## 🎯 Best Practices Tối Ưu Prompt

### 1. **Clear Role Definition**

```markdown
You are [specific role] specializing in [domain].
Your mission: [clear goal]
You DO: [actions]
You DO NOT: [limitations]
```

### 2. **Structured Instructions**

```markdown
## Workflow
1. [Step with clear action]
2. [Step with clear action]

## Output Format
- Format: [specification]
- Location: [path]
```

### 3. **Context Injection**

```markdown
## Required Context
- Read: ./docs/[specific-file]
- Understand: [specific concept]
- Follow: [specific pattern]
```

### 4. **Token Efficiency**

```markdown
**IMPORTANT:** Sacrifice grammar for concision
**IMPORTANT:** Max [X] lines per section
**IMPORTANT:** Progressive disclosure (overview → details)
```

### 5. **Quality Gates**

```markdown
## Success Criteria
- [ ] All tests pass
- [ ] No mocks/fake data
- [ ] Follows [standards]

## Exit Conditions
- DO NOT proceed if [condition]
- MUST wait for [event]
```

## 📊 Prompt Optimization Techniques

### Token Reduction Strategies

**1. Concise Instructions**
```markdown
❌ BAD:
"Please carefully analyze the codebase and make sure to read all
the documentation files before you start implementing..."

✅ GOOD:
"Read ./docs/codebase-summary.md, then implement following standards."
```

**2. Reference Over Repetition**
```markdown
❌ BAD:
Include full code examples in every prompt

✅ GOOD:
"Follow pattern in src/components/example.tsx:15-30"
```

**3. Structured Output**
```markdown
## Report Format
- Summary: [1-2 sentences]
- Changes: [bullet list]
- Issues: [if any]
```

### Context Preservation

```markdown
## Persistent Context (write to files)
./docs/codebase-summary.md      # Project structure
./docs/code-standards.md        # Coding rules
./plans/*/plan.md               # Implementation plan

## Transient Context (agent memory)
- Current task details
- Immediate findings
- Next steps
```
