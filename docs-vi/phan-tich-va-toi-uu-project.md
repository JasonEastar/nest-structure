# Phân Tích & Tối Ưu Project với ClaudeKit

## 🎯 Mục Tiêu

Sử dụng ClaudeKit để:
1. **Phân tích toàn bộ codebase**
2. **Đánh giá chất lượng code**
3. **Đưa ra recommendations tối ưu**
4. **Tạo roadmap nâng cấp**

## 🚀 Workflow Phân Tích Project

### Phase 1: Phân Tích Codebase (30-60 phút)

#### Bước 1: Tạo Codebase Summary

```bash
# Start Claude Code
cd ~/your-react-native-project
claude

# Command để phân tích
You: "Analyze the entire codebase and create a comprehensive summary.
      Include:
      - Project structure and architecture
      - Tech stack and dependencies
      - Component organization
      - State management patterns
      - API integration approach
      - Testing setup
      - Key files and their purposes

      Save the analysis to docs/codebase-summary.md"

# Claude sẽ:
# 1. Scan toàn bộ project structure
# 2. Read key files (package.json, src/*, etc)
# 3. Analyze patterns và conventions
# 4. Generate comprehensive summary
# 5. Save to docs/codebase-summary.md
```

#### Bước 2: Phân Tích Code Standards

```bash
You: "Analyze the coding standards and patterns used in this project.
      Check:
      - Component patterns (class vs functional)
      - TypeScript usage and type safety
      - Styling approach (StyleSheet, styled-components, etc)
      - Naming conventions
      - File organization
      - Import/export patterns
      - Error handling patterns

      Document findings in docs/code-standards-analysis.md"
```

#### Bước 3: Kiểm Tra Dependencies

```bash
You: "Analyze package.json and check:
      - Outdated dependencies
      - Security vulnerabilities
      - Unused dependencies
      - Peer dependency conflicts
      - Bundle size contributors

      Create a report in docs/dependencies-audit.md"
```

### Phase 2: Quality Assessment (30-45 phút)

#### Bước 1: Code Quality Review

```bash
You: "/review:codebase perform comprehensive code quality review.
      Focus on:
      - Code duplication
      - Complex functions that need refactoring
      - Performance bottlenecks
      - Memory leaks risks
      - Missing error handling
      - Accessibility issues
      - Security concerns

      Generate detailed report with file locations and recommendations"
```

**Alternative với custom prompt:**

```bash
You: "Use code-reviewer agent to review the entire codebase.
      Create a comprehensive quality report including:

      1. Architecture Assessment
         - Component structure
         - State management
         - Navigation flow
         - Data flow patterns

      2. Performance Issues
         - Heavy re-renders
         - Unoptimized lists
         - Large bundle size
         - Slow API calls

      3. Code Smells
         - Duplicated code
         - Long functions (>50 lines)
         - Deep nesting
         - Complex conditionals

      4. Best Practices
         - TypeScript usage
         - Error boundaries
         - Loading states
         - Error handling

      5. Security
         - API key exposure
         - Unsafe storage
         - XSS vulnerabilities
         - Input validation

      Save report to docs/code-quality-report.md with priority levels:
      - 🔴 Critical (must fix)
      - 🟡 Important (should fix)
      - 🟢 Nice to have (can improve)"
```

#### Bước 2: Performance Analysis

```bash
You: "Analyze React Native performance issues:

      1. Component Performance
         - Find components without React.memo()
         - Identify expensive renders
         - Check for inline functions in render
         - Find large components (>300 lines)

      2. List Performance
         - Audit all FlatList/ScrollView usage
         - Check for missing keyExtractor
         - Verify getItemLayout usage
         - Check windowSize and maxToRenderPerBatch

      3. Image Optimization
         - Check image sizes and formats
         - Verify lazy loading
         - Check for unoptimized PNGs

      4. Bundle Analysis
         - Identify large dependencies
         - Find unused imports
         - Check for duplicate dependencies

      Create detailed report in docs/performance-analysis.md"
```

#### Bước 3: Testing Assessment

```bash
You: "Evaluate testing setup and coverage:

      1. Current Test Coverage
         - Run npm test -- --coverage
         - Analyze coverage report
         - Identify untested files

      2. Test Quality
         - Check test patterns
         - Verify critical paths tested
         - Check for integration tests
         - Check E2E test coverage

      3. Missing Tests
         - Critical user flows
         - Edge cases
         - Error scenarios

      Save findings to docs/testing-assessment.md"
```

### Phase 3: Optimization Plan (45-90 phút)

#### Bước 1: Tạo Optimization Roadmap

```bash
You: "/plan create comprehensive optimization roadmap based on all analysis reports.

      Include these phases:

      Phase 1: Critical Fixes (Week 1-2)
      - Security vulnerabilities
      - Performance bottlenecks
      - Critical bugs

      Phase 2: Code Quality (Week 3-4)
      - Refactor complex components
      - Remove code duplication
      - Improve TypeScript coverage
      - Add error boundaries

      Phase 3: Performance (Week 5-6)
      - Optimize lists and renders
      - Image optimization
      - Bundle size reduction
      - API call optimization

      Phase 4: Testing (Week 7-8)
      - Increase test coverage to >80%
      - Add integration tests
      - Add E2E tests for critical flows

      Phase 5: Enhancement (Week 9-12)
      - Modernize architecture
      - Update dependencies
      - Improve accessibility
      - Documentation

      For each phase, provide:
      - Detailed tasks
      - Estimated effort
      - Priority
      - Dependencies
      - Success criteria

      Save to plans/optimization-roadmap.md"
```

#### Bước 2: Dependency Upgrade Plan

```bash
You: "Create a safe dependency upgrade plan:

      1. Audit Current Dependencies
         - Check versions vs latest
         - Check for breaking changes
         - Check compatibility

      2. Categorize Upgrades
         Priority 1 (Critical):
         - Security patches
         - React Native version
         - Critical bug fixes

         Priority 2 (Important):
         - Major version updates
         - New features needed

         Priority 3 (Nice to have):
         - Minor version updates
         - Dev dependencies

      3. Migration Strategy
         - Order of upgrades
         - Testing strategy per upgrade
         - Rollback plan
         - Estimated timeline

      4. Breaking Changes
         - List breaking changes for each upgrade
         - Required code modifications
         - Migration guides

      Save to plans/dependency-upgrade-plan.md"
```

#### Bước 3: Architecture Improvement Plan

```bash
You: "Analyze current architecture and propose improvements:

      1. Current Architecture Assessment
         - Component organization
         - State management approach
         - Data flow patterns
         - API integration
         - Navigation structure

      2. Issues with Current Approach
         - Scalability concerns
         - Maintainability issues
         - Performance bottlenecks
         - Testing challenges

      3. Proposed Architecture
         - Improved structure
         - Better separation of concerns
         - Scalable patterns
         - Modern best practices

      4. Migration Plan
         - Step-by-step migration
         - Minimal disruption strategy
         - Testing during migration
         - Rollback strategy

      Include diagrams (ASCII art) for:
      - Current architecture
      - Proposed architecture
      - Migration phases

      Save to plans/architecture-improvement.md"
```

## 📊 Comprehensive Analysis Command

Để chạy toàn bộ analysis trong 1 session:

```bash
You: "Perform comprehensive project analysis and optimization planning:

PHASE 1: ANALYSIS (Generate Reports)

1. Codebase Summary
   - Scan entire project structure
   - Analyze patterns and conventions
   - Document in docs/codebase-summary.md

2. Code Quality Audit
   - Use code-reviewer agent
   - Check all quality metrics
   - Prioritize findings (Critical/Important/Nice-to-have)
   - Document in docs/code-quality-report.md

3. Performance Analysis
   - Component performance
   - List optimization
   - Image optimization
   - Bundle analysis
   - Document in docs/performance-analysis.md

4. Security Audit
   - Check for vulnerabilities
   - API key exposure
   - Data storage security
   - Document in docs/security-audit.md

5. Testing Assessment
   - Current coverage
   - Missing tests
   - Test quality
   - Document in docs/testing-assessment.md

6. Dependencies Audit
   - Outdated packages
   - Security vulnerabilities
   - Unused dependencies
   - Document in docs/dependencies-audit.md

PHASE 2: PLANNING (Create Action Plans)

1. Optimization Roadmap
   - Prioritized phases (1-5)
   - Detailed tasks per phase
   - Timeline and effort estimates
   - Save to plans/optimization-roadmap.md

2. Dependency Upgrade Plan
   - Prioritized upgrades
   - Breaking changes handling
   - Migration strategy
   - Save to plans/dependency-upgrade-plan.md

3. Architecture Improvement
   - Current vs proposed architecture
   - Migration strategy
   - Benefits and risks
   - Save to plans/architecture-improvement.md

PHASE 3: SUMMARY

Create executive summary in docs/optimization-summary.md with:
- Key findings
- Critical issues requiring immediate attention
- Recommended prioritization
- Expected outcomes
- Resource requirements
- Timeline overview

Use multiple agents in parallel where possible to speed up analysis."
```

## 🎯 Targeted Analysis Commands

### Quick Performance Scan (10 phút)

```bash
You: "Quick performance scan:
      - Find all FlatList without optimization props
      - Find components without React.memo that should have it
      - Find inline functions in render methods
      - Check bundle size breakdown

      Give quick wins list that can be implemented in <2 hours"
```

### Security Quick Audit (10 phút)

```bash
You: "Quick security scan:
      - Check for hardcoded secrets/API keys
      - Check AsyncStorage for sensitive data
      - Check for SQL injection risks
      - Check for XSS vulnerabilities

      List critical security issues only"
```

### Code Smell Detection (15 phút)

```bash
You: "Find code smells:
      - Functions >50 lines
      - Files >300 lines
      - Duplicated code blocks
      - Complex conditionals (>3 nested levels)
      - Magic numbers
      - TODO/FIXME comments

      Prioritize by impact and effort to fix"
```

## 💡 Advanced Analysis với Skills

### Sử dụng Sequential Thinking

```bash
You: "Use sequential-thinking skill to analyze the authentication flow:

      1. Trace the entire auth flow from login to API calls
      2. Identify security issues
      3. Identify performance issues
      4. Suggest improvements with reasoning
      5. Create implementation plan

      Think step-by-step and show your reasoning process"
```

### Sử dụng AI Multimodal (nếu có screenshots)

```bash
You: "Use ai-multimodal skill to analyze these UI screenshots:
      [Provide screenshot paths]

      Check for:
      - Design inconsistencies
      - Accessibility issues
      - UX problems
      - Platform-specific issues

      Suggest improvements"
```

### Sử dụng Docs Seeker (research best practices)

```bash
You: "Use docs-seeker skill to research:
      - Latest React Native performance best practices 2025
      - Modern React Native architecture patterns
      - Testing strategies for React Native

      Compare with current project implementation
      Suggest updates based on latest best practices"
```

## 📋 Analysis Output Structure

Sau khi chạy analysis, bạn sẽ có:

```
docs/
├── codebase-summary.md           # Tổng quan codebase
├── code-quality-report.md        # Quality issues + fixes
├── performance-analysis.md       # Performance bottlenecks
├── security-audit.md             # Security vulnerabilities
├── testing-assessment.md         # Test coverage gaps
├── dependencies-audit.md         # Dependencies issues
└── optimization-summary.md       # Executive summary

plans/
├── optimization-roadmap.md       # Phased improvement plan
├── dependency-upgrade-plan.md    # Safe upgrade strategy
└── architecture-improvement.md   # Architecture evolution
```

## 🔄 Iterative Improvement Workflow

### Week 1: Critical Fixes

```bash
# 1. Review critical issues
You: "Show me all critical (🔴) issues from code-quality-report.md"

# 2. Create fix plan
You: "/plan fix all critical issues from the report"

# 3. Implement fixes
You: "/cook fix critical issues one by one"

# 4. Test
You: "/test"

# 5. Commit
You: "/git:cm"
```

### Week 2-3: Quality Improvements

```bash
# Focus on yellow (🟡) issues
You: "/plan address important quality issues from report"
You: "/cook implement quality improvements"
You: "/test"
```

### Week 4-6: Performance Optimization

```bash
# Implement performance improvements
You: "/plan implement performance optimizations from performance-analysis.md"
You: "/cook optimize components and lists"
You: "/test verify performance improvements"
```

## 📊 Tracking Progress

### Update Project Status

```bash
You: "Update project health status:

      Compare current state vs initial analysis:
      - Code quality score
      - Performance metrics
      - Test coverage
      - Security issues resolved
      - Technical debt reduced

      Update docs/optimization-summary.md with progress"
```

### Generate Progress Report

```bash
You: "Generate monthly progress report:

      1. Issues Fixed
         - Critical: [count]
         - Important: [count]
         - Nice-to-have: [count]

      2. Metrics Improved
         - Test coverage: [old] → [new]
         - Bundle size: [old] → [new]
         - Performance score: [old] → [new]

      3. Next Month Priorities
         - [List top 5 priorities]

      Save to docs/progress-reports/YYYY-MM.md"
```

## 🎓 Tips cho Analysis Hiệu Quả

### 1. Chạy Analysis Theo Batch

```bash
# Thay vì 1 lệnh lớn, chia nhỏ:
Session 1: Codebase + Code Quality (1 giờ)
Session 2: Performance + Security (1 giờ)
Session 3: Testing + Dependencies (1 giờ)
Session 4: Planning (1 giờ)
```

### 2. Sử dụng Parallel Agents

```bash
You: "Spawn these agents in parallel:
      - code-reviewer for quality audit
      - debugger for performance analysis
      - tester for test assessment

      Have them report back with findings"
```

### 3. Focus on Impact

```bash
# Prioritize theo impact vs effort
You: "For each issue found, calculate:
      - Impact: High/Medium/Low
      - Effort: High/Medium/Low
      - Priority = Impact / Effort

      Sort by priority and show top 10 quick wins"
```

### 4. Incremental Improvements

```bash
# Không cần fix hết 1 lúc
Week 1: Top 5 critical issues
Week 2: Top 10 important issues
Week 3: Performance low-hanging fruits
Week 4: Testing gaps
```

## 🚀 Expected Outcomes

Sau khi complete optimization:

### Code Quality
- ✅ Reduced code duplication by 50%+
- ✅ All critical security issues fixed
- ✅ TypeScript coverage >90%
- ✅ Average function length <30 lines
- ✅ File sizes <200 lines

### Performance
- ✅ App launch time reduced by 30%+
- ✅ Smooth 60fps scrolling
- ✅ Bundle size reduced by 20%+
- ✅ API response time optimized
- ✅ Memory usage reduced

### Testing
- ✅ Test coverage >80%
- ✅ Critical flows have integration tests
- ✅ E2E tests for main user journeys
- ✅ All tests passing

### Architecture
- ✅ Clear separation of concerns
- ✅ Scalable component structure
- ✅ Consistent patterns throughout
- ✅ Well-documented codebase
- ✅ Modern best practices

---

**Bắt đầu phân tích project ngay! 🔍📊**
