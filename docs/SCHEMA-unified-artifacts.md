# Unified Artifact Schema

## Overview

All session artifacts (checkpoint, handoff, finalize) share a common schema defined in `.claude/hooks/src/shared/artifact-schema.ts`.

## Schema Version

Current version: **1.0.0**

The `schema_version` field enables future evolution without breaking existing artifacts.

## Event Types

Three entry points to the same core structure:

| Event Type | Purpose | When to Use |
|------------|---------|-------------|
| `checkpoint` | Mid-session state capture | Before risky operations, at milestones |
| `handoff` | Session transfer | Ending session, handing off work |
| `finalize` | Session closure memorial | Task complete, capture solutions/decisions |

## Required Fields (All Modes)

```yaml
schema_version: "1.0.0"
event_type: checkpoint | handoff | finalize
timestamp: 2026-01-14T00:54:26.972Z
goal: One-line success criteria
now: Current focus / immediate next action
outcome: SUCCEEDED | PARTIAL_PLUS | PARTIAL_MINUS | FAILED
```

## Optional Metadata

```yaml
session_id: 77ef540c
session_name: descriptive-session-name
primary_bead: Continuous-Claude-v3-ug8.6   # required for handoff/finalize
related_beads:
  - Continuous-Claude-v3-ug8.1
```

## Progress Tracking

```yaml
this_session:
  - task: Implemented unified artifact writer
    files:
      - .claude/hooks/src/shared/artifact-writer.ts
  - task: Added schema validation
    files:
      - .claude/hooks/src/shared/artifact-validator.ts

next:
  - Update documentation
  - Run integration tests

blockers:
  - Need confirmation on migration path

questions:
  - Should we auto-push on finalize?
```

## Decisions, Learnings, Findings

```yaml
decisions:
  decision_name: Rationale for this decision

learnings:
  worked:
    - Unified schema reduces maintenance
  failed:
    - Markdown-only format was too unstructured

findings:
  key_finding: Details about this finding
```

## Git Metadata

```yaml
git:
  branch: feat/continuity-system
  commit: abc1234
  remote: origin
  pr_ready: "https://example.com/pull/123"
```

## Files Changed

```yaml
files:
  created:
    - .claude/hooks/src/shared/artifact-writer.ts
  modified:
    - .claude/hooks/src/shared/artifact-schema.ts
  deleted:
    - .claude/hooks/src/legacy-writer.ts
```

## Handoff-Specific Fields

```yaml
primary_bead: Continuous-Claude-v3-ug8.6
related_beads:
  - Continuous-Claude-v3-ug8.1
files_to_review:
  - path: .claude/hooks/src/shared/artifact-writer.ts
    note: Core writer implementation
continuation_prompt: |
  Start by reviewing the artifact writer tests.
  Next step is to run integration tests.
```

## Finalize-Specific Fields

```yaml
primary_bead: Continuous-Claude-v3-ug8.7
final_solutions:
  - problem: Artifact systems duplicated logic
    solution: Unified writer + schema
    rationale: Single source of truth and consistent format

final_decisions:
  - decision: Use YAML frontmatter for all artifacts
    rationale: Readable and parseable
    alternatives_considered:
      - JSON files
      - Markdown-only
    why_this: Best balance of structure and readability

artifacts_produced:
  - path: .claude/hooks/src/shared/artifact-writer.ts
    note: Unified writer implementation
```

## Full Example (Checkpoint)

```yaml
---
schema_version: "1.0.0"
event_type: checkpoint
timestamp: 2026-01-14T01:23:45.678Z
session_id: abc12345
goal: Implement unified artifact writer
now: Writing tests for schema validation
outcome: PARTIAL_PLUS
---

this_session:
  - task: Added artifact schema
    files:
      - .claude/hooks/src/shared/artifact-schema.ts

next:
  - Add unit tests
  - Update docs
```

## Schema Reference

See `.claude/hooks/src/shared/artifact-schema.ts` for the complete schema definition.
