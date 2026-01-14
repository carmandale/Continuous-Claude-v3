---
description: Create or update continuity ledger for state preservation across clears
---

# Continuity Ledger

> **Note:** This skill is an alias for `/create_handoff`. Use the unified artifact system.

Create a unified artifact to preserve session state across `/clear` or session boundaries.

## Quick Path

Use the core generator:

```bash
~/.claude/scripts/cc-artifact --mode <checkpoint|handoff|finalize> [--bead <BEAD_ID>] [--session-title "<short title>"]
```

Artifacts are written to:
```
thoughts/shared/handoffs/<session>/YYYY-MM-DD_HH-MM_<title>_<mode>.yaml
```

## Required Fields

- `schema_version`: "1.0.0"
- `mode`: checkpoint | handoff | finalize
- `date`: ISO 8601 date or date-time
- `session`: Session folder name (bead + slug)
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

/resume_handoff thoughts/shared/handoffs/<session>/[filename]
```

For full details, follow `~/.claude/skills/create_handoff/SKILL.md`.
