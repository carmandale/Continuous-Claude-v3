# Multi-Session Architecture

How handoffs and status lines work across multiple Claude Code instances.

## Overview

When multiple Claude Code instances work on the same project, they share workflow state through handoffs. The status line shows the **latest workflow checkpoint**, not per-instance state.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    WORKFLOW: open-source-release                            │
│                                                                             │
│  Handoffs Directory: thoughts/shared/handoffs/events/                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 2026-01-09T14-00-00.000Z_a1b2c3d4.md  ← Instance A created          │   │
│  │ 2026-01-09T15-00-00.000Z_e5f6a7b8.md  ← Instance B created          │   │
│  │ 2026-01-09T16-00-00.000Z_c9d0e1f2.md  ← Instance C created ★ LATEST │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘

                              │
                              ▼ status.py reads LATEST

┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   Instance A     │  │   Instance B     │  │   Instance C     │
│                  │  │                  │  │                  │
│ Status Line:     │  │ Status Line:     │  │ Status Line:     │
│ ┌──────────────┐ │  │ ┌──────────────┐ │  │ ┌──────────────┐ │
│ │goal: task-c  │ │  │ │goal: task-c  │ │  │ │goal: task-c  │ │
│ │now: task-c   │ │  │ │now: task-c   │ │  │ │now: task-c   │ │
│ └──────────────┘ │  │ └──────────────┘ │  │ └──────────────┘ │
│                  │  │                  │  │                  │
│ ALL SEE SAME     │  │ ALL SEE SAME     │  │ ALL SEE SAME     │
│ (latest handoff) │  │ (latest handoff) │  │ (latest handoff) │
└──────────────────┘  └──────────────────┘  └──────────────────┘
```

## Key Concepts

### Handoff = Workflow Checkpoint

A handoff is created when work is **complete** and being handed off:
- "I'm DONE with X, here's what the workflow needs next"
- Contains: goal, now, done_this_session, blockers, next steps
- Stored in: `thoughts/shared/handoffs/events/YYYY-MM-DDTHH-MM-SS.sssZ_sessionid.md`
- Use `session_name` in frontmatter to group by workflow if needed

### Status Line = Shared Workflow State

The status line shows the **latest handoff** for situational awareness:
- `goal:` What the workflow accomplished
- `now:` What needs to happen next
- All instances see the same values (shared)

### Conversation = Instance State

What each instance is currently working on lives in its conversation context, not the status line.

## Why Shared (Not Isolated)?

| Shared (Current) | Isolated (Alternative) |
|------------------|------------------------|
| All instances see latest workflow state | Each instance only sees its own handoffs |
| Prevents stale/duplicate work | Could miss updates from other instances |
| Handoffs are checkpoints, not live state | Status line would show stale data |

**Decision:** Shared is correct because handoffs represent workflow state, not instance state.

## Timeline Example

```
14:00  Instance A creates handoff → goal: "fix bug"
       All instances see: "fix bug"

15:00  Instance B creates handoff → goal: "add feature"
       All instances see: "add feature"

16:00  Instance C creates handoff → goal: "write tests"
       All instances see: "write tests"
```

Each instance's status line updates when ANY instance creates a new handoff. This is intentional - it shows the latest workflow state.

## Implementation

### Handoff Creation (`/create_handoff`)

```yaml
# thoughts/shared/handoffs/events/YYYY-MM-DDTHH-MM-SS.sssZ_sessionid.md
---
event_type: handoff
timestamp: 2026-01-09T14:00:00.000Z
session_id: a1b2c3d4
session_name: open-source-release
---

goal: What this session accomplished
now: What next session should do first
```

### Status Line (`status.py`)

```python
# Finds latest artifact by filename timestamp in events/
# Extracts goal: and now: fields from YAML frontmatter/body
# Displays in status line for ALL instances
```

### Context Percentage (Per-Instance)

The token/context percentage IS per-instance:
```python
# Written to /tmp/claude-context-pct-{session_id}.txt
# Each instance has its own context tracking
```

## Summary

| What | Scope | Why |
|------|-------|-----|
| Handoff goal/now | Shared (workflow) | Workflow checkpoint, not live state |
| Context % | Per-instance | Each instance has own context window |
| Active work | Per-instance | Lives in conversation, not status line |
