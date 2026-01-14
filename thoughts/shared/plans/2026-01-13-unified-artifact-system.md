# Unified Artifact System

## Overview

Unify checkpoint, handoff, and finalize into a single core function with three entry points. Eliminate duplication between `.handoff/`, `.checkpoint/`, and `thoughts/shared/handoffs/` directories.

## Problem Statement

Current state has multiple overlapping systems:
- Slash commands: `/handoff`, `/checkpoint` → `.handoff/`, `.checkpoint/`
- Skills: `create_handoff`, `continuity_ledger` → `thoughts/shared/handoffs/`
- Different formats (Markdown vs YAML)
- No `/finalize` for session closure

This causes:
- Duplication of artifacts in different formats/locations
- Confusion about which to use when
- Missing "memorial" capability for completed work

## Research Source

**Pi-Agent Session:** 2026-01-12T18:48:40Z
**Title:** "what is the intention in this system for wrap up? for collecting decisions and creating an artifact"
**Location:** `~/.pi/agent/sessions/.../2026-01-12T18-48-40-984Z_*.jsonl`

Searchable via: `cass search "unified artifact checkpoint handoff finalize" --robot`

## Proposed Solution

### One Core Function, Three Entry Points

```
/checkpoint ──┐
              ├──> create_handoff(mode, bead?) ──> YAML artifact
/handoff ─────┤
              │
/finalize ────┘
```

All write to: `thoughts/shared/handoffs/{session}/YYYY-MM-DD_HH-MM_{short-title}_{mode}.yaml`

**Format:** YAML frontmatter + YAML body (no Markdown body).

### Mode Comparison

| Mode | Bead Required | Focus | Character |
|------|---------------|-------|-----------|
| **checkpoint** | No | Current state | Open, flexible, quick snapshot |
| **handoff** | Yes | Transfer package | Strict: plan, bead, files, instructions |
| **finalize** | Yes | Memorial | Solutions, final decisions, closure |

### Common Fields (All Modes)

```yaml
---
mode: checkpoint | handoff | finalize
date: 2026-01-13T10:00:00Z
session: Continuous-Claude-v3-123-auth-refactor
primary_bead: Continuous-Claude-v3-123
outcome: SUCCEEDED | PARTIAL_PLUS | PARTIAL_MINUS | FAILED
---

goal: One-liner success criteria
now: Current focus (one thing)

done_this_session:
  - Completed item 1
  - Completed item 2

next:
  - Priority 1
  - Priority 2

decisions:
  - key: rationale

worked:
  - What worked well
failed:
  - What didn't work and why
```

### Mode-Specific Fields

**Checkpoint (additional):**
```yaml
# None - lightest weight
```

**Handoff (additional):**
```yaml
related_beads: [cd5, c2f]

files_to_review:
  - path: src/auth/session.py
    note: New session model
  - path: tests/unit/test_session.py
    note: 15 new tests

continuation_prompt: |
  Continue working on bead p33.
  Next: Implement logout endpoint.
```

**Finalize (additional):**
```yaml
related_beads: [cd5, c2f]

final_solutions:
  - problem: JWT tokens too complex
    solution: Switched to session-based auth with Redis
    rationale: Simpler, no token refresh logic needed

final_decisions:
  - decision: Use Redis for session storage
    alternatives_considered: [PostgreSQL, in-memory]
    why_this: 24h TTL matches our needs, horizontal scaling

artifacts_produced:
  - path: src/auth/session.py
    note: Session model and Redis integration
  - path: docs/auth-migration.md
    note: Migration guide from JWT
```

## Implementation Phases

### Phase 1: Create Core Generator

**File:** (internal generator script)

```bash
# internal generator invoked by /checkpoint, /handoff, /finalize
```

The script:
1. Validates bead requirement (handoff/finalize)
2. Gathers git metadata
3. Generates YAML template (frontmatter + YAML body)
4. Opens for editing or outputs directly

### Phase 2: Update Slash Commands

**Files:**
- `~/.claude/commands/checkpoint.md` → calls internal generator
- `~/.claude/commands/handoff.md` → calls internal generator
- `~/.claude/commands/finalize.md` → NEW, calls internal generator

Each command:
1. Invokes the core generator
2. Captures decisions plus worked/failed notes
3. Asks for outcome
4. Commits and optionally pushes

### Phase 3: Update create_handoff Skill

**File:** `~/.claude/skills/create_handoff/SKILL.md`

Changes:
- Add `mode` parameter to YAML schema
- Add bead integration fields
- Add finalize-specific fields (final_solutions, final_decisions)
- Reference canonical directory only (`thoughts/shared/handoffs/`)

### Phase 4: Deprecate Legacy Directories

**Stop writing to:**
- `.handoff/` (legacy)
- `.checkpoint/` (legacy)

**Keep:**
- `thoughts/shared/handoffs/` (canonical)

Historical files remain for reference but no new files written.

### Phase 5: Update Downstream Tooling (bead yqg)

**Only if pain appears:**
- `session-start-continuity.ts` - parse YAML goal/now
- `artifact_index.py` - index YAML artifacts
- Update AGENTS.md references

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `~/.claude/scripts/cc-artifact` | CREATE | Core generator script |
| `~/.claude/commands/checkpoint.md` | MODIFY | Call cc-artifact |
| `~/.claude/commands/handoff.md` | MODIFY | Call cc-artifact |
| `~/.claude/commands/finalize.md` | CREATE | New finalize command |
| `~/.claude/skills/create_handoff/SKILL.md` | MODIFY | Add mode + bead fields |

## Acceptance Criteria

- [ ] `/checkpoint` creates YAML artifact in `thoughts/shared/handoffs/{bead}-{short-title}/`, bead optional
- [ ] `/handoff` creates YAML artifact, bead required (hard stop if none)
- [ ] `/finalize` creates YAML artifact with final_solutions/final_decisions, bead required
- [ ] All three capture outcome and worked/failed notes
- [ ] No new files written to `.handoff/` or `.checkpoint/`
- [ ] SessionStart hook continues to work (extracts goal/now from YAML body)

## Open Questions

| Question | Proposed Answer |
|----------|-----------------|
| Session name with bead? | `primary_bead` + short slug (prompt for session if missing) |
| Auto-commit behavior? | Legacy behavior (minimize change) |
| Outcome marking? | All modes support outcomes |

## Related Beads

| Bead | Status | Relationship |
|------|--------|--------------|
| **yqg** | Open (P4) | Downstream: YAML-aware tooling |
| **p33** | Closed | Prior: Ledger synthesizer |
| **cd5** | Closed | Prior: Refactored session-start hook |
| **c2f** | Closed | Prior: Refactored session-end hook |

## Estimated Complexity

**Medium** - Core logic is straightforward but touches multiple slash commands and the create_handoff skill.

- Phase 1 (Core generator): 2 hours
- Phase 2 (Slash commands): 1 hour
- Phase 3 (Skill update): 1 hour
- Phase 4 (Deprecation): 30 min
- Phase 5 (Downstream): Deferred to bead yqg

**Total:** ~5 hours implementation

## References

- Pi-Agent session: `cass search "unified artifact checkpoint handoff finalize" --robot`
- Current create_handoff skill: `~/.claude/skills/create_handoff/SKILL.md`
- Ledger synthesis plan: `thoughts/shared/plans/2026-01-11-ledger-synthesis-system.md`
- Automatic continuity plan: `thoughts/shared/plans/2026-01-10-automatic-continuity-system.md`
