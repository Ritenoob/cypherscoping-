# Multi-AI Assistant Orchestration

**Pattern:** Strategic AI tool selection and configuration management across Claude, Codex, Gemini, Copilot, and GPT-Pilot for optimal development workflows.

**Context:** Developer environments increasingly leverage multiple AI assistants, each with specialized capabilities. This skill documents proven patterns for orchestration, configuration, and context management across AI tools to maximize productivity.

**When this applies:**
- Choosing between Claude, Codex, Gemini, Copilot, or GPT-Pilot for a task
- Managing configurations across multiple AI assistants
- Preserving context when switching between AI tools
- Setting up multi-AI workflows for team collaboration
- Optimizing AI tool selection based on task characteristics

**Key patterns:**

## 1. AI Tool Selection Matrix

### Claude Code (Pilot)
**Best for:**
- Complex multi-file refactoring (6+ files)
- Structured planning with `/spec` workflow
- TypeScript/Python codebases with strict type safety
- TDD workflows with comprehensive test coverage
- Production-grade code requiring verification loops
- Context-heavy analysis requiring semantic search (vexor)

**Configuration location:** `~/.claude/`
**Key features:**
- Multi-agent task management (TaskCreate, TaskUpdate, TaskList)
- Semantic codebase search via vexor
- Auto-compaction with state preservation
- MCP servers (mem-search, context7, web-search, grep-mcp)
- Verification sub-agents (plan-verifier, spec-reviewer)
- Git worktree isolation for `/spec`
- Persistent memory across sessions

**Configuration pattern:**
```json
{
  "model": "sonnet",
  "enabledPlugins": { "tdd-workflows": true, "backend-development": true },
  "env": {
    "CLAUDE_CODE_ENABLE_TASKS": "true",
    "ENABLE_TOOL_SEARCH": "true",
    "ENABLE_LSP_TOOL": "true"
  },
  "permissions": {
    "allow": ["Skill(spec)", "Task(*)", "mcp__*"]
  }
}
```

### Codex
**Best for:**
- Quick bug fixes (1-3 files)
- Shell script automation
- Command-line tool usage
- Database query generation
- Configuration file edits
- Performance-critical code optimization

**Configuration location:** `~/.codex/`
**Key features:**
- Shell snapshot integration
- Project trust levels (trusted/untrusted)
- Pragmatic personality mode
- Fast iteration cycles
- Prefix rule system for security
- Model: gpt-5.3-codex with high reasoning effort

**Configuration pattern:**
```toml
model = "gpt-5.3-codex"
model_reasoning_effort = "high"
personality = "pragmatic"

[projects."/path/to/project"]
trust_level = "trusted"

[features]
shell_snapshot = true
```

**Security pattern (prefix rules):**
- Automatically learns safe command patterns
- Blocks risky operations in untrusted projects
- Exports rules as `default.rules` for reuse

### Gemini
**Best for:**
- Rapid prototyping (MVP/POC)
- Documentation generation
- Content creation and marketing copy
- Multi-modal tasks (image + code)
- Large-scale skill library (134 specialized skills)
- Business analysis and planning

**Configuration location:** `~/.gemini/`
**Key features:**
- OAuth authentication
- Massive skill library (134+ pre-built agents)
- Project state management
- Preview features and auto-updates
- Trusted folder system

**Configuration pattern:**
```json
{
  "security": { "auth": { "selectedType": "oauth-personal" } },
  "general": { "previewFeatures": true, "enableAutoUpdate": true },
  "hasSeenIdeIntegrationNudge": true
}
```

**Skill discovery pattern:**
```bash
ls ~/.gemini/skills/
# accessibility-tester, api-designer, backend-developer, blockchain-developer,
# cloud-architect, code-reviewer, data-engineer, devops-engineer, etc.
```

### Copilot
**Best for:**
- Inline code completion during active coding
- Function/class generation from comments
- Test case generation
- Boilerplate code (REST endpoints, CRUD)
- Quick refactoring suggestions
- Auto-completion in IDE

**Configuration location:** `~/.copilot/`
**Key features:**
- Real-time inline suggestions
- IDE integration (VS Code, JetBrains)
- Command history state
- Session persistence
- Minimal configuration overhead

**Configuration pattern:**
```json
{
  "banner": "never",
  "render_markdown": true,
  "theme": "auto",
  "trusted_folders": ["/path/to/project"],
  "allowed_urls": ["http://localhost:*"]
}
```

### GPT-Pilot (Pythagora)
**Best for:**
- Full-stack app scaffolding (green-field projects)
- Multi-agent project generation
- Database-backed applications
- Complete feature implementation from requirements
- UI/UX + backend coordination

**Configuration location:** `~/gpt-pilot/`
**Key features:**
- Multi-provider support (OpenAI, Anthropic, Azure, Groq)
- Per-agent model configuration
- Project workspace management
- Structured logging to file
- Database integration (SQLite + aiosqlite)
- Asyncio-compatible architecture

**Configuration pattern:**
```json
{
  "llm": {
    "anthropic": {
      "base_url": "https://api.anthropic.com",
      "api_key": "your-key",
      "connect_timeout": 60.0,
      "read_timeout": 20.0
    }
  },
  "agent": {
    "default": {
      "provider": "openai",
      "model": "gpt-4o-2024-05-13",
      "temperature": 0.5
    }
  },
  "fs": {
    "workspace_root": "workspace",
    "ignore_paths": [".git", "node_modules", "venv", "dist"],
    "ignore_size_threshold": 50000
  }
}
```

## 2. Task Routing Decision Tree

```
New Task → Characteristics?

├─ Architecture/Design → Claude /spec
│  └─ Plan review required → Claude Opus
│
├─ Quick Fix (<5 min) → Codex
│  └─ Shell/CLI heavy → Codex pragmatic mode
│
├─ Green-field Project → GPT-Pilot
│  └─ Full-stack → Pythagora multi-agent
│
├─ Active Coding Session → Copilot
│  └─ Inline completion → IDE integration
│
├─ Content/Documentation → Gemini
│  └─ Specialized skill → Load from 134-skill library
│
└─ Complex Refactor (6+ files) → Claude Pilot
   └─ TDD required → Claude with verification sub-agents
```

## 3. Configuration Management Patterns

### Centralized Rule System (Claude)
**Pattern:** Store reusable rules in `~/.claude/rules/` (global) and `.claude/rules/` (project-specific).

**Structure:**
```
~/.claude/rules/
├── cli-tools.md          # Tool references (vexor, pilot, playwright-cli)
├── development-practices.md
├── testing.md            # TDD workflow, coverage requirements
├── verification.md       # Execution verification patterns
└── task-and-workflow.md  # Task management, /spec workflow

.claude/rules/            # Project-specific
├── agent-development.md  # Trading agent patterns
├── typescript-migration.md
└── symbol-policy.md      # Domain-specific rules
```

**Rule loading:** Always loaded automatically, survive updates.

### Project Trust Levels (Codex)
**Pattern:** Explicitly mark projects as trusted/untrusted to control command execution.

```toml
[projects."/home/user/production-app"]
trust_level = "trusted"  # Full command execution

[projects."/home/user/untrusted-repo"]
trust_level = "untrusted"  # Restricted, requires prefix rules
```

### Skill Libraries (Gemini)
**Pattern:** 134 pre-built specialized agents for domain-specific tasks.

**Discovery workflow:**
1. List available skills: `ls ~/.gemini/skills/`
2. Select by domain: `backend-developer`, `devops-engineer`, `security-auditor`
3. Invoke via Gemini CLI

**Example skills:**
- `accessibility-tester` - WCAG compliance
- `api-designer` - REST/GraphQL API design
- `blockchain-developer` - Smart contract development
- `cloud-architect` - AWS/Azure/GCP infrastructure
- `data-engineer-pro` - ETL pipelines, data lakes
- `security-auditor` - Vulnerability scanning

### Trusted Folders (Copilot/Gemini)
**Pattern:** Whitelist project directories for automatic activation.

```json
{
  "trusted_folders": [
    "/home/user/miniature-enigma",
    "/home/user/Desktop/rideendine"
  ]
}
```

## 4. Context Preservation Strategies

### Cross-Tool Context Handoff
**Problem:** Context lost when switching AI assistants mid-task.

**Solution patterns:**

#### A. Session State Export (Claude → Codex)
```bash
# In Claude session
TaskList  # Export current tasks
# Copy task descriptions to Codex prompt

# In Codex
"Continuing from Claude session: [task context]"
```

#### B. File-Based Context (Any → Any)
```bash
# Create handoff file
echo "## Context
- Current objective: [goal]
- Files modified: [list]
- Next steps: [plan]
" > .ai-context.md

# Reference in next tool
cat .ai-context.md  # Feed to next AI assistant
```

#### C. Git Commit Messages (Universal)
```bash
# Claude finishes feature branch
git commit -m "feat: Add user authentication

- Implemented JWT token generation
- Added password hashing with bcrypt
- Created /login and /register endpoints
- Tests: 12/12 passing

Next: Add refresh token rotation (Codex)"
```

### Memory Systems

**Claude Pilot Memory (MCP mem-search):**
- Persistent across all sessions
- Search past decisions: `mcp__plugin_pilot_mem-search__search(query="JWT implementation")`
- Timeline context: `timeline(anchor=ID, depth_before=3, depth_after=3)`
- Manual save: `save_memory(text="Decision: Use RS256 for JWT", title="Auth Design")`

**GPT-Pilot Database:**
- SQLite-backed project state
- Survives process restarts
- Query via `pythagora.db`

**Codex Shell Snapshots:**
- Captures shell state before/after commands
- Enables rollback and debugging
- Stored in `~/.codex/shell_snapshots/`

## 5. Workflow Automation Patterns

### Sequential AI Pipeline
**Pattern:** Chain AI tools for multi-stage workflows.

**Example: Feature Development Pipeline**
```bash
# Stage 1: Planning (Claude /spec)
claude
> /spec Add user authentication with JWT tokens
# → Generates plan in docs/plans/2026-02-21-auth.md

# Stage 2: Implementation (Claude /spec-implement)
# → Auto-runs after plan approval
# → Creates code, tests, verification

# Stage 3: Quick fixes (Codex)
codex
> Fix the JWT expiration edge case in auth.ts
# → Fast iteration for bug fixes

# Stage 4: Documentation (Gemini)
gemini
> Generate API documentation for authentication endpoints
# → Content creation

# Stage 5: Inline optimization (Copilot)
# → Open in IDE, Copilot suggests performance improvements
```

### Parallel Specialization
**Pattern:** Use multiple AI tools simultaneously for different aspects.

**Example: Full-Stack Feature**
```bash
# Terminal 1: Backend (Claude)
claude
> Implement REST API for user management

# Terminal 2: Frontend (Copilot in IDE)
# → Inline completions for React components

# Terminal 3: Database (Codex)
codex
> Create migration for users table with indexes

# Terminal 4: Docs (Gemini)
gemini --skill documentation-engineer
> Generate OpenAPI spec from backend code
```

### Model Routing (Claude)
**Pattern:** Use different models for different phases.

```json
{
  "planning": "claude-opus-4-6",      // Deep reasoning
  "implementation": "claude-sonnet-4-5",  // Fast execution
  "verification": "claude-opus-4-6"   // Thorough review
}
```

**Implementation:** Claude Pilot automatically routes:
- `/spec` planning → Opus
- Implementation → Sonnet
- Verification sub-agents → Opus

## 6. Security and Safety Patterns

### Prefix Rules (Codex)
**Pattern:** Auto-learn safe command patterns to prevent destructive operations.

```python
# ~/.codex/rules/default.rules
prefix_rule(pattern=["rm", "-rf", "/"], decision="deny")
prefix_rule(pattern=["git", "push", "--force"], decision="ask")
prefix_rule(pattern=["npm", "install"], decision="allow")
```

**Learning mode:** Codex observes successful commands and auto-generates rules.

### Permission System (Claude)
**Pattern:** Explicit allow/deny lists for tools and MCP servers.

```json
{
  "permissions": {
    "allow": [
      "Bash(pytest:*)",
      "Bash(npm test:*)",
      "Task(spec-reviewer-*:*)",
      "mcp__plugin_pilot_mem-search__*"
    ],
    "deny": [
      "Bash(rm -rf:*)",
      "Bash(git push --force:*)"
    ]
  }
}
```

### Trusted Folders (Copilot/Gemini)
**Pattern:** Restrict AI assistance to explicitly trusted directories.

```json
{
  "trusted_folders": ["/home/user/production"],
  "allowed_urls": ["http://localhost:*"]
}
```

**Prevents:** Accidental exposure of sensitive repos to cloud AI.

## 7. Team Collaboration Patterns

### Shared Rules (Claude Vault)
**Pattern:** Git-backed rule sharing via `sx` tool.

```bash
# Push project-specific rules to team vault
REPO=$(git remote get-url origin)
sx add .claude/rules/agent-development.md --yes --type rule \
  --name "agent-development" --scope-repo $REPO

# Team members pull
sx install --repair --target .
```

**Scope options:**
- `--scope-repo` → Project-specific (recommended)
- `--scope-global` → All repos for user
- `--scope-repo "url#path"` → Monorepo path-scoped

### Configuration Templates
**Pattern:** Version control AI configurations for team consistency.

```bash
# Project root
.claudeconfig.json      # Claude settings
.codexrc               # Codex configuration
.gemini.json           # Gemini project settings
.gpt-pilot.json        # GPT-Pilot agent setup
```

**Example `.claudeconfig.json`:**
```json
{
  "model": "sonnet",
  "enabledPlugins": {
    "tdd-workflows@claude-code-workflows": true,
    "backend-development@claude-code-workflows": true
  },
  "env": {
    "CLAUDE_CODE_ENABLE_TASKS": "true"
  }
}
```

### Context Handoff Documents
**Pattern:** Create `.ai-context/` directory for cross-tool collaboration.

```bash
.ai-context/
├── current-task.md      # Active work
├── decisions.md         # Architecture decisions
├── blockers.md          # Known issues
└── handoff-claude.md    # Claude → Codex handoff notes
```

## 8. Performance Optimization

### Token Efficiency
**Claude strategies:**
- Use vexor for semantic search (zero tokens until results read)
- Batch file reads in parallel (`Read` multiple files in one message)
- Use `TaskList` instead of full chat history

**Codex strategies:**
- Pragmatic personality (concise responses)
- Shell snapshots reduce re-explaining context

**GPT-Pilot strategies:**
- Ignore large files (`ignore_size_threshold: 50000`)
- Focused file system access

### Model Selection by Cost/Speed
```
Planning (deep reasoning):
└─ Claude Opus 4.6 (highest cost, best quality)

Implementation (fast iteration):
├─ Claude Sonnet 4.5 (balanced)
├─ Codex gpt-5.3 (fast, pragmatic)
└─ Copilot (inline, real-time)

Documentation:
└─ Gemini (low cost, good prose)

Code completion:
└─ Copilot (real-time, free for individuals)
```

## 9. Debugging and Diagnostics

### Multi-Tool Debugging Strategy
**Pattern:** Use different AI assistants for different debugging phases.

**Phase 1: Root Cause (Codex)**
- Fast iteration on hypotheses
- Shell command debugging
- Log file analysis

**Phase 2: Pattern Analysis (Claude + vexor)**
- Semantic search for similar bugs: `vexor "authentication token validation"`
- Cross-file dependency analysis
- MCP grep-mcp for production examples

**Phase 3: Fix Implementation (Claude /spec)**
- TDD workflow (failing test first)
- Verification sub-agents
- Comprehensive testing

**Phase 4: Performance Profiling (Codex)**
- Generate profiling commands
- Analyze flamegraphs
- Quick optimization iterations

### LSP Integration (Claude)
**Pattern:** Real-time diagnostics from language servers.

```json
{
  "env": { "ENABLE_LSP_TOOL": "true" }
}
```

**Supported:** Python (Pyright), TypeScript (tsserver), Go (gopls)

**Usage:** Claude automatically queries LSP for type errors, go-to-definition, hover info.

## 10. Reference Quick Guide

### Configuration Files Location Summary
```
Claude:     ~/.claude/settings.json, ~/.claude/rules/
Codex:      ~/.codex/config.toml, ~/.codex/rules/default.rules
Gemini:     ~/.gemini/settings.json, ~/.gemini/skills/
Copilot:    ~/.copilot/config.json
GPT-Pilot:  ~/gpt-pilot/config.json
```

### Tool Selection Cheat Sheet
```
Task Type              → Primary Tool    → Secondary Tool
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Architecture/Design    → Claude /spec    → Gemini (docs)
Quick Bug Fix          → Codex           → Copilot
Green-field Project    → GPT-Pilot       → Claude (refine)
Inline Coding          → Copilot         → Codex (complex)
Multi-file Refactor    → Claude Pilot    → Codex (fixes)
Content Creation       → Gemini          → Claude (technical)
Shell Automation       → Codex           → Claude (complex)
Database Queries       → Codex           → Claude (migrations)
Full-stack Scaffold    → GPT-Pilot       → Claude (quality)
TDD Workflow           → Claude          → Codex (red→green)
```

### Context Preservation Commands
```bash
# Claude → Export state
TaskList                     # Current tasks
~/.pilot/bin/pilot check-context --json  # Context usage

# Codex → Shell state
cat ~/.codex/shell_snapshots/latest.json

# GPT-Pilot → Project state
sqlite3 ~/gpt-pilot/data/database/pythagora.db "SELECT * FROM projects;"

# Universal → Git commit
git log -1 --format="%B"     # Last commit message
```

### MCP Server Quick Reference (Claude)
```bash
# Discover tools
ToolSearch(query="+mem-search search")
ToolSearch(query="+context7 resolve")
ToolSearch(query="+web-search search")
ToolSearch(query="+grep-mcp searchGitHub")

# Use directly after discovery
mcp__plugin_pilot_mem-search__search(query="pattern")
mcp__plugin_pilot_context7__query-docs(libraryId="/npm/react", query="hooks")
mcp__plugin_pilot_web-search__search(query="TypeScript best practices 2026")
mcp__plugin_pilot_grep-mcp__searchGitHub(query="FastMCP", language=["Python"])
```

## Anti-Patterns to Avoid

### 1. Context Thrashing
**Bad:** Switch AI tools mid-task without preserving context.
**Good:** Complete logical units of work before switching, document handoff.

### 2. Duplicate Configuration
**Bad:** Maintain separate, divergent configs for each AI tool.
**Good:** Use shared `.ai-config/` directory with tool-specific overrides.

### 3. Wrong Tool for Task
**Bad:** Use Claude /spec for quick 1-line bug fix (over-engineering).
**Good:** Codex for quick fixes, Claude /spec for complex features.

### 4. Ignoring Security Boundaries
**Bad:** Mark all projects as trusted, disable safety checks.
**Good:** Use trust levels, prefix rules, permission systems.

### 5. Manual Context Re-entry
**Bad:** Re-explain project context to each AI assistant manually.
**Good:** Use Claude Memory, Git commits, `.ai-context/` files.

## Practical Examples

### Example 1: Trading Bot Feature (Actual Pattern)
```bash
# Planning phase (Claude)
cd ~/Desktop/cypherscoping
claude
> /spec Add idempotency protection to prevent duplicate orders

# Implementation (Claude auto)
# → Creates src/core/idempotency-store.ts
# → Adds tests in test/trading-executor.safety.test.ts
# → Verification sub-agents review

# Quick fix (Codex)
codex
> Fix the hash collision edge case in idempotency-store.ts

# Documentation (Gemini)
gemini --skill api-documenter
> Generate API docs for idempotency system
```

### Example 2: Full-Stack App
```bash
# Scaffold (GPT-Pilot)
cd ~/projects
gpt-pilot create --name food-delivery-app
> Build a food delivery app with React frontend, Node.js backend, PostgreSQL

# Backend refinement (Claude)
claude
> Refactor the order management system to use event sourcing

# Frontend optimization (Copilot)
# → Open in VS Code, inline completions for React components

# Quick API fixes (Codex)
codex
> Add rate limiting to the /orders endpoint
```

### Example 3: Documentation Sprint
```bash
# Architecture docs (Claude)
claude
> Analyze the codebase and generate C4 architecture diagrams

# API reference (Gemini)
gemini --skill api-documenter
> Generate OpenAPI spec from Express routes

# README (Gemini)
gemini --skill documentation-engineer
> Create comprehensive README with setup, usage, deployment

# Code comments (Copilot)
# → Inline JSDoc generation in IDE
```

## Summary

**Key Principles:**
1. **Right Tool for Right Task** - Match AI assistant capabilities to task characteristics
2. **Preserve Context** - Use files, Git, Memory systems for cross-tool handoffs
3. **Automate Configuration** - Version control configs, share via team vaults
4. **Security First** - Use trust levels, permissions, prefix rules
5. **Parallel Specialization** - Run multiple AI tools simultaneously for complex workflows
6. **Model Routing** - Use expensive models for planning, fast models for iteration

**Configuration Hierarchy:**
- Global rules: `~/.claude/rules/`, `~/.codex/config.toml`
- Project rules: `.claude/rules/`, `.claudeconfig.json`
- Team shared: Git-backed vault via `sx` tool

**Context Preservation:**
- Claude: MCP mem-search, TaskList, plan files
- Codex: Shell snapshots, prefix rules
- GPT-Pilot: SQLite database
- Universal: Git commits, `.ai-context/` directory

**Tool Selection Matrix:**
- Complex (6+ files) → Claude /spec
- Quick (<5 min) → Codex
- Green-field → GPT-Pilot
- Active coding → Copilot
- Content → Gemini
- Specialized domain → Gemini skills (134 options)
