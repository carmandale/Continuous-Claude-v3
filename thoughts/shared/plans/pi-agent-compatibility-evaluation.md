# Continuous Claude v3 - Pi-Agent Compatibility Evaluation

## Executive Summary

**Continuous Claude v3** is a sophisticated system built specifically for Claude Code. About **40% is directly usable** by pi-agent, **30% needs adaptation**, and **30% is Claude Code-specific**.

---

## Architecture Comparison

| Component | Continuous Claude (Claude Code) | Pi-Agent | Compatible? |
|-----------|--------------------------------|----------|-------------|
| **Skills** | `.claude/skills/*/SKILL.md` | `~/.pi/agent/skills/*/SKILL.md` | ✅ **Yes** - Pi reads Claude skills |
| **Agents** | `.claude/agents/*.md` (Task tool) | Extensions + tools | ⚠️ Partial - need adaptation |
| **Hooks** | TypeScript/Python via settings.json | Extensions (TypeScript) | ⚠️ Different API |
| **Memory** | PostgreSQL + pgvector | None built-in | ⚠️ Can use, needs wiring |
| **Continuity** | Ledgers + handoffs | Session branching | ⚠️ Different model |
| **TLDR** | 5-layer code analysis | None | ✅ Can use as bash tool |
| **Rules** | `.claude/rules/*.md` | AGENTS.md | ⚠️ Different location |

---

## What Works Directly (✅)

### 1. Skills (109 available)

Pi-agent reads Claude Code skills from `~/.claude/skills/` by default!

```json
// ~/.pi/agent/settings.json
{
  "skills": {
    "enableClaudeUser": true,      // ~/.claude/skills/
    "enableClaudeProject": true    // ./.claude/skills/
  }
}
```

**All 109 skills are immediately available** to pi-agent:
- `commit`, `debug`, `explore`, `fix`, `plan`, `research`, etc.
- Workflow skills like `create_handoff`, `resume_handoff`
- Tool skills like `ast-grep-find`, `github-search`, `qlty-check`

### 2. TLDR Code Analysis

TLDR is a standalone CLI tool. Pi-agent can use it via bash:

```bash
tldr tree .                    # AST structure
tldr context src/file.py       # Semantic context
tldr impact src/file.py:42     # Change impact analysis
```

### 3. Memory System Scripts

The `opc/scripts/core/` scripts work as standalone tools:

```bash
# Recall learnings
cd opc && uv run python scripts/core/recall_learnings.py --query "auth patterns"

# Store learnings  
cd opc && uv run python scripts/core/store_learning.py --session-id "pi-session" --type WORKING_SOLUTION --content "..."
```

**Pi-agent can call these via bash** - the PostgreSQL backend is shared.

### 4. Handoff/Continuity Files

The `thoughts/shared/` directory structure works for any agent:
- `thoughts/shared/plans/` - Implementation plans
- `thoughts/shared/handoffs/` - Session handoffs
- `thoughts/shared/checkpoints/` - Auto-snapshots

Pi-agent can read and write these as regular files.

---

## What Needs Adaptation (⚠️)

### 1. Hooks → Extensions

**Claude Code hooks** use `settings.json` + stdin/stdout:
```json
{
  "hooks": {
    "SessionStart": [{ "command": "node hook.mjs" }]
  }
}
```

**Pi-agent extensions** use TypeScript API:
```typescript
export default function(pi: ExtensionAPI) {
  pi.on("session_start", async (event, ctx) => { ... });
}
```

**Migration approach:**
- Core logic can be extracted and shared
- Wrapper needed for each platform's API
- Some hooks (like `memory-awareness`) could become pi extensions

### 2. Agents → Extensions + Tools

**Claude Code agents** are prompt files invoked via Task tool:
```markdown
---
name: scout
tools: [Read, Bash, Grep]
---
# Scout Agent
You explore codebases...
```

**Pi-agent equivalent:**
1. **Skill** (for the workflow/instructions)
2. **Extension tool** (for stateful/interactive agents)

Example migration:
```typescript
// Pi extension for scout-like behavior
pi.registerTool({
  name: "scout",
  description: "Explore codebase for patterns",
  async execute(id, params, onUpdate, ctx) {
    // Use built-in read/bash/grep
    // Follow scout.md instructions
  }
});
```

### 3. Rules → AGENTS.md

**Claude Code rules** are in `.claude/rules/*.md`:
- `dynamic-recall.md`
- `proactive-memory-disclosure.md`

**Pi-agent** uses `AGENTS.md` at project root.

**Migration:** Consolidate rules into AGENTS.md or a referenced file.

### 4. Skill Activation System

Claude Code has a **hook-based skill activation** that injects hints:
```
🎯 SKILL ACTIVATION CHECK
⚠️ CRITICAL: create_handoff
📚 RECOMMENDED: fix, debug
```

Pi-agent skills are **loaded on-demand** by the LLM based on description matching.

**Gap:** Pi doesn't have proactive skill suggestions. Could build as extension.

---

## What Won't Work (❌)

### 1. Claude Code-Specific Settings

`.claude/settings.json` format is Claude Code specific:
- Hook definitions
- Status line commands
- Tool permissions

### 2. Braintrust Integration

The Braintrust tracing hooks are deeply integrated with Claude Code's internals.

### 3. Multi-Session Coordination

The `session-register` system uses Claude Code's session IDs and file claims.

### 4. Compiler-in-the-Loop

The `PostToolUse` hooks that run TypeScript checks after edits are Claude Code specific.

---

## Recommended Setup for Pi-Agent

### 1. Enable Claude Skills

```json
// ~/.pi/agent/settings.json
{
  "skills": {
    "enableClaudeUser": true,
    "enableClaudeProject": true
  }
}
```

### 2. Create Pi Extensions for Key Hooks

Priority hooks to port:
1. `memory-awareness` - Query memory on user prompt
2. `session-start-continuity` - Load ledger on start
3. `session-end-comprehensive` - Save state on exit (our new plan!)

### 3. Add Memory Commands to AGENTS.md

```markdown
## Memory System

To recall past learnings:
\`\`\`bash
cd $PROJECT/opc && uv run python scripts/core/recall_learnings.py --query "topic"
\`\`\`

To store new learnings:
\`\`\`bash
cd $PROJECT/opc && uv run python scripts/core/store_learning.py --session-id "pi" --type TYPE --content "..."
\`\`\`
```

### 4. Use Continuity Files

Reference the handoff/continuity structure in AGENTS.md:
```markdown
## Continuity

- Plans: `thoughts/shared/plans/`
- Handoffs: `thoughts/shared/handoffs/`
- Resume with: Read the latest handoff file
```

---

## Skill Compatibility Details

### Claude Code-Specific Frontmatter

Pi loads skills but **ignores** these Claude Code-specific fields:

| Field | Claude Code Behavior | Pi Behavior | Impact |
|-------|---------------------|-------------|--------|
| `user-invocable: false` | Hides skill from user suggestions | Shows skill anyway | Internal rules appear as usable skills |
| `triggers: [...]` | Keywords activate skill suggestion | Ignored - uses `description` only | Less precise skill matching |
| `priority: high/low` | Order when multiple skills match | Ignored | Non-deterministic multi-match |
| `model: opus/sonnet` | Sub-agent uses specified model | Ignored | Runs on current model |
| `keywords: [...]` | Additional search terms | Ignored | Relies only on `description` |

### Naming Issues (Blocking for Some Skills)

Pi requires kebab-case names. These skills have invalid names:

```
❌ continuity_ledger   →  ✅ continuity-ledger
❌ create_handoff      →  ✅ create-handoff  
❌ resume_handoff      →  ✅ resume-handoff
❌ implement_plan      →  ✅ implement-plan
❌ implement_task      →  ✅ implement-task
❌ describe_pr         →  ✅ describe-pr
❌ system_overview     →  ✅ system-overview
```

### Missing Descriptions (Required by Pi)

These skills lack the required `description` field:
- `loogle-search`, `recall`, `remember`
- `tldr-deep`, `tldr-overview`, `tldr-router`
- `tour`, `system_overview`

### Name Collisions

When skills exist in both `~/.claude/skills/` and `./.claude/skills/`:
- Pi loads the **first one found** (user global wins)
- Project-specific versions are skipped
- This may cause unexpected behavior if project needs different version

### Practical Implications

| Scenario | Claude Code | Pi |
|----------|-------------|-----|
| User says "calculate 2+2" | Hook triggers `math-router` via `triggers` | Searches descriptions, might miss |
| Internal rule skill | Hidden (`user-invocable: false`) | Shown as usable skill |
| Complex task needing Opus | Uses Opus (`model: opus`) | Uses current model |
| Project-specific skill | Project version used | User global version used |

### Recommendations

1. **For Pi compatibility**: Rename underscore skills to hyphens
2. **For Pi compatibility**: Add `description` to all skills
3. **Accept warnings**: Claude-specific frontmatter is harmless (ignored)
4. **Be aware**: `user-invocable: false` skills will appear in Pi's skill list

---

## Effort Estimate for Full Pi Integration

| Task | Effort | Value |
|------|--------|-------|
| Enable Claude skills | 5 min | High - immediate access to 109 skills |
| Add memory commands to AGENTS.md | 15 min | High - enables recall |
| Port memory-awareness hook | 2 hr | High - proactive recall |
| Port continuity hooks | 4 hr | High - session persistence |
| Port skill-activation | 4 hr | Medium - nice to have |
| Port all 30 hooks | 20+ hr | Low - diminishing returns |

**Recommended first step:** Enable Claude skills and add memory commands. That gets 80% of the value with 20 minutes of work.

---

## Key Insight

The **semantic memory system** (PostgreSQL + pgvector) is **agent-agnostic**. It doesn't care whether Claude Code or pi-agent stores/recalls learnings. 

The **scripts work as standalone CLI tools**. Pi-agent can use them via bash.

The **skills are compatible**. Pi reads Claude skill format natively.

The **hooks/extensions** are platform-specific but logic is portable.

**Bottom line:** This repo is 70% usable by pi-agent with minimal effort, and the continuity system we're building will work for both.
