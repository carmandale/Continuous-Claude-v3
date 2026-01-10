---
description: Create handoff document for transferring work to another session
---

# Create Handoff

You are tasked with writing a handoff document to hand off your work to another agent in a new session. You will create a handoff document that is thorough, but also **concise**. The goal is to compact and summarize your context without losing any of the key details of what you're working on.

**CRITICAL: Every handoff MUST include a Ledger section. This is non-negotiable.**

## Process

### 1. Determine Session Name (MANDATORY)

**First, check for an existing session name:**
```bash
# Check new format (handoff with Ledger)
ls thoughts/shared/handoffs/*/current.md 2>/dev/null | head -1 | sed 's|.*/handoffs/\([^/]*\)/.*|\1|'

# Check legacy format (separate ledger file)
ls thoughts/ledgers/CONTINUITY_CLAUDE-*.md 2>/dev/null | head -1 | sed 's/.*CONTINUITY_CLAUDE-\(.*\)\.md/\1/'
```

**If no session name exists, you MUST ask the user:**

```
No active work stream found. What should I call this session?

Please provide a short, kebab-case name describing the work stream:
- Examples: `auth-refactor`, `api-migration`, `bug-fix-memory-leak`, `open-source-release`
```

**DO NOT use `general` as a default.** Every session deserves a meaningful name.

### 2. Filepath

**Create your file under:** `thoughts/shared/handoffs/{session-name}/YYYY-MM-DD_HH-MM_description.md`

Where:
- `{session-name}` is the work stream name (REQUIRED - never use "general")
- `YYYY-MM-DD` is today's date
- `HH-MM` is the current time in 24-hour format
- `description` is a brief kebab-case description of what was done

**Ensure directory exists:**
```bash
mkdir -p thoughts/shared/handoffs/{session-name}
```

### 3. Write Handoff with MANDATORY Ledger Section

**Every handoff MUST include the `## Ledger` section at the top.** This section is extracted by the SessionStart hook and survives context clears.

```markdown
---
date: YYYY-MM-DDTHH:MM:SSZ
session: {session-name}
status: complete|partial|blocked
outcome: SUCCEEDED|PARTIAL_PLUS|PARTIAL_MINUS|FAILED
---

# Handoff: {description}

## Ledger
<!-- MANDATORY: This section is extracted by SessionStart hook for context recovery -->
**Updated:** YYYY-MM-DDTHH:MM:SSZ
**Goal:** {One-liner success criteria - shown in statusline}
**Branch:** {git branch}
**Test:** {Command to verify this work}

### Now
[->] {What next session should do FIRST - ONE thing only}

### This Session
- [x] {Completed item 1}
- [x] {Completed item 2}
- [x] {Completed item 3}

### Next
- [ ] {Priority 1 for next session}
- [ ] {Priority 2}
- [ ] {Priority 3}

### Decisions
- {decision}: {rationale}

### Open Questions
- UNCONFIRMED: {things needing verification}

---

## What Was Done

{Detailed description of work completed this session}

### Files Changed
- `path/to/file1.py` - {what changed}
- `path/to/file2.ts` - {what changed}

## Learnings

### What Worked
- {Approach that worked well}

### What Failed
- {Approach that failed and why - save future sessions from repeating}

## Blockers

{Any blocking issues, or "None"}

## Context for Next Session

{Any additional context the next session needs to know}
```

### 4. Mark Session Outcome (REQUIRED)

**Before responding to the user, you MUST ask about the session outcome.**

Ask the user:
```
How did this session go?
- SUCCEEDED: Task completed successfully
- PARTIAL_PLUS: Mostly done, minor issues remain
- PARTIAL_MINUS: Some progress, major issues remain  
- FAILED: Task abandoned or blocked
```

After the user responds, mark the outcome:
```bash
PROJECT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-.}")
cd "$PROJECT_ROOT/opc" && uv run python scripts/core/artifact_mark.py --latest --outcome <USER_CHOICE>
```

### 5. Confirm Completion

After marking the outcome, respond:

```
✅ Handoff created: thoughts/shared/handoffs/{session-name}/{filename}

Ledger section included for context recovery.
Outcome marked as {OUTCOME}.

Resume in a new session with:
/resume_handoff thoughts/shared/handoffs/{session-name}/{filename}
```

---

## Ledger Section Requirements

The `## Ledger` section is **MANDATORY** because:

1. **SessionStart hook extracts it** - Automatically loaded on resume/clear/compact
2. **Survives context clears** - External file means full fidelity, no compression loss
3. **Enables continuity** - Next session knows exactly where to pick up

### Ledger Field Guide

| Field | Required | Purpose |
|-------|----------|---------|
| `**Updated:**` | ✅ | Timestamp for freshness |
| `**Goal:**` | ✅ | One-liner shown in statusline |
| `**Branch:**` | ✅ | Git branch for this work |
| `**Test:**` | ✅ | Command to verify work |
| `### Now` | ✅ | ONE thing - current focus |
| `### This Session` | ✅ | What was completed |
| `### Next` | ✅ | Prioritized next steps |
| `### Decisions` | Recommended | Key choices and rationale |
| `### Open Questions` | Recommended | Uncertainties to verify |

### The `[->]` Marker

The `[->]` prefix in `### Now` indicates the single current focus:
```markdown
### Now
[->] Implementing logout endpoint with session invalidation
```

This forces focus - only ONE item should have `[->]`.

---

## Migration from Legacy Ledger

If a legacy ledger exists at `thoughts/ledgers/CONTINUITY_CLAUDE-*.md`:

1. **Read the legacy ledger content**
2. **Extract the key sections** (Goal, State, Agent Reports)
3. **Incorporate into the new Ledger section** in your handoff
4. **Do NOT delete the legacy file** (keep for reference)

---

## Additional Notes

- **More information, not less** - This is the minimum; include more if needed
- **Be thorough and precise** - Include both high-level objectives and implementation details
- **Avoid excessive code snippets** - Prefer `path/to/file.ext:line` references
- **Update the Ledger section** if creating multiple handoffs in one session
- **Never skip the Ledger** - It's the backbone of continuity
