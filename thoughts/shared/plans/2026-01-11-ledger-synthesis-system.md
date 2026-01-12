# Ledger Synthesis System

## Overview

Solve the ledger merge conflict problem when multiple agents work in parallel worktrees. The solution uses **scoped ledger files** that get **synthesized** into a unified `current.md` - avoiding git merge conflicts entirely.

## Problem Statement

When parallel agents (worktrees, branches, Gas Town polecats) both update continuity state:
- PostgreSQL learnings: No conflict (UUID keys) ✓
- Git-tracked ledgers: Standard git merge conflicts ✗

Current `current.md` is a single file that multiple agents overwrite → merge conflicts.

## Solution: Scoped Ledgers + Synthesis

### Core Insight (from Oracle + Gas Town research)

1. **Stop treating `current.md` as source of truth** - treat it as a generated view
2. **Each agent writes to its own scoped file** - `ledger-{agent-id}.md`
3. **Synthesis compiles scoped files** → unified `current.md`
4. **No merge conflicts possible** - concurrent work adds different files

### Directory Structure

```
thoughts/shared/handoffs/
├── events/                           # Single central location for ALL events
│   ├── 2026-01-10T13-03-52Z_toast.md   # branch: feat/feature-a
│   ├── 2026-01-10T14-15-00Z_waffle.md  # branch: main
│   └── 2026-01-11T08-00-00Z_crisp.md   # branch: fix/bug-b
├── current.md                        # Generated view (can be regenerated)
└── archive/                          # Archived after synthesis
    └── 2026-01-10/
```

**Note:** All events go to one `events/` directory regardless of branch. The branch is recorded in each event's YAML frontmatter for filtering/grouping.

### Event File Format

Each session writes a small, append-only event file:

```yaml
---
ts: 2026-01-10T13:03:52Z
agent: toast
branch: feat/fix-hooks-path-spaces
type: session_end
reason: clear
---

now: Create PR from carmandale:fix/hooks-path-spaces to parcadei:main

this_session:
- Forked parcadei/Continuous-Claude-v3
- Wrapped 25 hooks in bash -c for spaced path support
- Compiled TypeScript hooks

decisions:
  bash_c_wrapper: "Use bash -c '...' for shell quoting"
  single_quotes_outer: "Single quotes outside, double inside"

checkpoints:
- phase: 5
  status: validated
  updated: 2026-01-10T13:00:00Z
```

### Section Merge Semantics (CRDT-like)

| Section | Type | Merge Rule |
|---------|------|------------|
| **Now** | LWW Register | Pick entry with max `(ts, agent_id)` |
| **This Session** | Grow-only Set | Union, dedupe by content hash |
| **Decisions** | LWW Map | Merge by key, newest timestamp wins |
| **Checkpoints** | Grow-only List | Concatenate, sort by timestamp |
| **Open Questions** | Grow-only Set | Union, dedupe exact matches |

## Implementation Phases

### Phase 1: Event Writer (SessionEnd hook modification) ✅ COMPLETE

**File:** `$HOME/.claude/hooks/src/session-end-cleanup.ts`

**Changes:**
1. Instead of updating `current.md` directly, write an event file to central `thoughts/shared/handoffs/events/`
2. Event file name: `{ISO-timestamp}_{agent-id}.md`
3. Use YAML frontmatter + markdown body (includes branch name for filtering)
4. Atomic write (write to temp, rename)

**Acceptance:**
- [x] SessionEnd creates event file in `events/` directory
- [x] Event file has proper YAML frontmatter (ts, agent, branch, type, reason)
- [x] No direct modification of `current.md`
- [x] Build passes

### Phase 2: Synthesizer (new component) ✅ COMPLETE

**Files:**
- `$HOME/.claude/hooks/src/synthesize-ledgers.ts` - Core logic
- `$HOME/.claude/skills/synthesize-ledgers/SKILL.md` - Interactive skill
- `$HOME/.claude/scripts/cc-synthesize` - CLI wrapper

**Algorithm:**
```typescript
function synthesize(eventsDir: string): Ledger {
  const events = readAllEvents(eventsDir);

  return {
    now: pickLatest(events, 'now'),           // LWW
    thisSession: unionByHash(events, 'this_session'), // Grow-only set
    decisions: mergeByKey(events, 'decisions'),       // LWW map
    checkpoints: sortByTime(flatMap(events, 'checkpoints')), // Grow-only list
    openQuestions: union(events, 'open_questions'),   // Grow-only set
  };
}
```

**Acceptance:**
- [x] Synthesizer reads all event files from directory
- [x] Applies correct merge semantics per section
- [x] Outputs valid `current.md` format
- [x] Handles empty/malformed events gracefully
- [x] 22 unit tests pass

### Phase 3: SessionStart Integration ✅ COMPLETE

**File:** `.claude/hooks/src/session-start-continuity.ts`

**Changes:**
1. On startup, run synthesizer to generate fresh `current.md`
2. Load the synthesized result
3. Show which events were combined

**Output:**
```
━━━ SESSION START ━━━
📋 Continuity synthesized from 3 events:
   • toast (2026-01-10T13:03) - hooks fix
   • waffle (2026-01-10T14:15) - tests
   • crisp (2026-01-11T08:00) - docs

   Goal: Fix hooks for paths with spaces
   Now: Create PR to upstream
━━━━━━━━━━━━━━━━━━━━━
```

### Phase 4: Interactive Skill ✅ COMPLETE

**File:** `$HOME/.claude/skills/synthesize-ledgers/SKILL.md`

**Triggers:** `/synthesize-ledgers`, "synthesize ledgers", "merge ledgers"

**Flow:**
1. Discover event files
2. Show preview of what will be merged
3. Confirm with user
4. Run synthesis
5. Optionally archive source events
6. Optionally commit

### Phase 5: CLI Tool ✅ COMPLETE

**File:** `$HOME/.claude/scripts/cc-synthesize`

**Usage:**
```bash
cc-synthesize                           # Interactive
cc-synthesize --no-confirm              # Automation
cc-synthesize --input "events/*.md"     # Custom input
cc-synthesize --archive --commit        # Full workflow
cc-synthesize --check                   # CI mode - fail if stale
```

### Phase 6: Gas Town Integration (DEFERRED)

**Integration point:** `gt refinery` command

**Status:** Deferred - requires modification to compiled `gt` binary (Go source not available in this workspace)

**Proposed Integration:**
```bash
# In refinery workflow, before merging polecat work:
cc-synthesize --no-confirm --commit
```

**Workaround:** Until Gas Town integration is implemented:
1. Use `cc-synthesize` manually before `gt refinery` merge operations
2. Or add a pre-merge hook script that calls `cc-synthesize`

**Implementation Notes:**
- `gt` is a compiled Go binary at `~/bin/gt`
- Gas Town config is at `~/.config/gastown/`
- Refinery manages merge queue via `gt refinery` (alias `gt ref`)
- Would need to either:
  - Modify Go source to call `cc-synthesize` during refinery merge
  - Add hook mechanism to Gas Town refinery workflow

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `$HOME/.claude/hooks/src/session-end-cleanup.ts` | MODIFY | Write events instead of updating current.md |
| `$HOME/.claude/hooks/src/synthesize-ledgers.ts` | CREATE | Core synthesis logic |
| `$HOME/.claude/hooks/src/session-start-continuity.ts` | MODIFY | Synthesize on startup |
| `$HOME/.claude/skills/synthesize-ledgers/SKILL.md` | CREATE | Interactive skill |
| `$HOME/.claude/scripts/cc-synthesize` | CREATE | CLI wrapper |
| `thoughts/shared/handoffs/*/events/` | CREATE | Event directories |

## Testing Strategy

1. **Unit:** Event parser handles various formats
2. **Unit:** Each merge function (LWW, union, etc.) works correctly
3. **Integration:** SessionEnd creates event file
4. **Integration:** SessionStart synthesizes and loads
5. **E2E:** Two parallel sessions → merge → unified ledger
6. **E2E:** Gas Town polecats → refinery → main

## Migration Path

1. Keep existing `current.md` support during transition
2. If `events/` directory exists, use synthesis
3. If only `current.md` exists, use legacy behavior
4. Gradually migrate existing handoffs to event format

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **Workstream detection** | Simplified: All events go to single `events/` directory. Branch recorded in frontmatter for filtering. |
| Event file corruption | Validate YAML on read, skip malformed |
| Clock skew between agents | Include agent ID in tiebreaker |
| Too many event files | Archive old events after synthesis (7-day default retention) |
| Performance (many files) | Cache synthesized result, invalidate on new events |
| Interleaved synth writes | Per-stream `.synth.lock` file |
| Non-deterministic output | Sort all sets/lists deterministically |
| Stale current.md in PRs | CI `cc-synthesize --check` gate |

## Implementation Details (from Oracle)

### Locking
Use a per-stream lock file (`.synth.lock`) so two synthesis invocations in the same worktree can't interleave.

### Deterministic Ordering
Sort sets/lists deterministically so two runs on the same inputs produce byte-identical `current.md`. This prevents spurious diffs.

### Metadata Footer
Include synthesis metadata in `current.md`:
```markdown
---
_synthesized:
  event_count: 5
  latest_ts: 2026-01-11T08:00:00Z
  generated_at: 2026-01-11T09:15:00Z
---
```
This lets humans/CI quickly detect staleness.

## Research Sources

- **Oracle (GPT-5.2 Pro):** CRDT semantics, towncrier fragment pattern
- **Gas Town agent:** Refinery workflow, synthesis skill design
- **LangGraph:** Checkpointer persistence pattern
- **AutoGen:** Redis-backed memory
- **towncrier:** Changelog fragment pattern (avoid merge conflicts)

## Resolved Questions (2026-01-11)

### Q: Should `current.md` be git-tracked or generated on-demand only?
**A: Git-tracked.** Commit on session_end and handoff so PRs show unified view.

### Q: How long to keep archived events?
**A: Configurable, default 7 days.** Make retention easily adjustable.

### Q: When should synthesis happen?
**A: Generate often, commit strategically, enforce at integration.**

| Trigger | Synthesize? | Commit? |
|---------|-------------|---------|
| Session start | ✅ Always | ❌ No |
| After event write | ✅ Always | ❌ No |
| Session end | ✅ Always | ✅ Yes |
| Handoff | ✅ Always | ✅ Yes |
| Checkpoint | ✅ Always | ⚡ Throttle (30 min max) |
| Pre-push/CI | ✅ Validate | ❌ Fail if stale |

### Q: How to handle merge conflicts on current.md?
**A: Pattern A (simpler):** Require branch up-to-date + CI `cc-synthesize --check`
**A: Pattern B (bulletproof):** `.gitattributes merge=ours` + regenerate at merge

Source: Oracle GPT-5.2 Pro consultation (2026-01-11)

## Estimated Complexity

**Medium** - Core synthesis is straightforward, but need to modify multiple hooks and create new skill/CLI.

- Event writer: Simple (1-2 hours)
- Synthesizer core: Medium (2-3 hours)
- SessionStart integration: Simple (1 hour)
- Skill + CLI: Medium (2 hours)
- Testing: Medium (2 hours)
- Gas Town integration: Simple (1 hour)

Total: ~10-12 hours implementation
