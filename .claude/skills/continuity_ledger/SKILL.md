---
description: Create or update continuity ledger for state preservation across clears
---

# Continuity Ledger

> **Note:** This skill is an alias for `/create_handoff`. Use the unified artifact system.

Create a unified artifact to preserve session state across `/clear` or session boundaries.

## Quick Path

Use the core generator:

```bash
~/.claude/scripts/cc-artifact --mode <checkpoint|handoff|finalize> [--bead <BEAD_ID>]
```

Artifacts are written to:
```
thoughts/shared/handoffs/events/YYYY-MM-DDTHH-MM-SS.sssZ_sessionid.md
```

## Required Fields

- `schema_version`: "1.0.0"
- `event_type`: checkpoint | handoff | finalize
- `timestamp`: ISO 8601
- `goal`: What this session accomplished
- `now`: Current focus / next action
- `outcome`: SUCCEEDED | PARTIAL_PLUS | PARTIAL_MINUS | FAILED
- `primary_bead`: required for handoff/finalize

## Outcome (Required)

Ask the user:

```
Question: "How did this session go?"
Options:
  - SUCCEEDED: Task completed successfully
  - PARTIAL_PLUS: Mostly done, minor issues remain
  - PARTIAL_MINUS: Some progress, major issues remain
  - FAILED: Task abandoned or blocked
```

After marking the outcome, confirm completion and provide the resume command:

```
Artifact created! Outcome: [OUTCOME]

/resume_handoff thoughts/shared/handoffs/events/[filename]
```

For full details, follow `~/.claude/skills/create_handoff/SKILL.md`.
