# Migration Guide: Unified Artifact System

## Overview

As of version 1.0.0 (January 2026), Continuous Claude has unified the artifact system. Previously, checkpoints, handoffs, and finalize events used separate directories and formats. Now, all artifacts use a single location and schema.

## What Changed

### Old System (pre-1.0.0)

```
thoughts/
├── checkpoints/
│   └── <session>/
│       └── *.yaml
├── handoffs/
│   └── <session>/
│       └── *.yaml
└── finalize/
    └── <session>/
        └── *.yaml
```

### New System (1.0.0+)

```
thoughts/shared/handoffs/events/
└── YYYY-MM-DDTHH-MM-SS.sssZ_sessionid.md
```

**Key changes:**
1. **Single location**: All artifacts go to `thoughts/shared/handoffs/events/`
2. **Unified schema**: Same structure for checkpoint, handoff, and finalize
3. **Timestamped filenames**: `2026-01-14T00-54-26.972Z_77ef540c.md`
4. **YAML frontmatter**: Schema version and event type in metadata

## Schema Changes

### Old Format (per-session directories)

```yaml
---
date: 2026-01-08T15:26:01+0000
session_name: feature-x
status: complete
---

# Handoff: Feature X

## Tasks
- [x] Task 1
- [ ] Task 2
```

### New Format (unified)

```yaml
---
schema_version: "1.0.0"
event_type: handoff
timestamp: 2026-01-14T00:54:26.972Z
session_id: 77ef540c
bead_id: bd-123
---

# Session Handoff

## Goal
Feature X implementation

## Completed This Session
- task: Task 1
  files: [file1.py, file2.py]

## Next Steps
1. Task 2
2. Task 3

## Outcome
PARTIAL_PLUS
```

## Migration Script

If you have existing artifacts in the old format, you can migrate them:

```bash
cd opc
uv run python scripts/migrate/migrate_artifacts.py
```

**What it does:**
- Scans `thoughts/checkpoints/`, `thoughts/handoffs/`, `thoughts/finalize/`
- Converts to unified schema
- Writes to `thoughts/shared/handoffs/events/`
- Preserves original files (non-destructive)
- Generates timestamped filenames

**Options:**
- `--dry-run`: Show what would be migrated without writing
- `--verbose`: Show detailed conversion process
- `--session <name>`: Migrate only a specific session

## For Developers

### Writing Code

**Old way:**
```python
# Separate writers for each type
from checkpoint_writer import write_checkpoint
from handoff_writer import write_handoff
from finalize_writer import write_finalize
```

**New way:**
```typescript
import { writeArtifact } from './shared/artifact-writer.js';

// All event types use the same function
await writeArtifact(artifact, 'checkpoint');
await writeArtifact(artifact, 'handoff');
await writeArtifact(artifact, 'finalize');
```

### Schema Validation

**Old way:**
- No formal schema
- Field validation in writers
- Inconsistent structure

**New way:**
```typescript
import { assertValidArtifact } from './shared/artifact-validator.js';
import type { UnifiedArtifact } from './shared/artifact-schema.js';

// Type-safe at compile time
const artifact: UnifiedArtifact = { ... };

// Runtime validation
assertValidArtifact(artifact);  // throws if invalid
```

### Reading Artifacts

**Old way:**
```bash
# Find by session name
ls thoughts/handoffs/feature-x/*.yaml | sort -r | head -1
```

**New way:**
```bash
# Find by timestamp (most recent)
ls -t thoughts/shared/handoffs/events/*.md | head -1

# Find by session ID
grep -l "session_id: 77ef540c" thoughts/shared/handoffs/events/*.md

# Find by bead ID
grep -l "bead_id: bd-123" thoughts/shared/handoffs/events/*.md
```

## Backward Compatibility

The new system is **not backward compatible** with the old format. However:

1. **Old artifacts are preserved**: Migration is non-destructive
2. **Gradual migration**: You can migrate sessions as needed
3. **Skills updated**: All skills now reference the new location

## Benefits of Unified System

| Benefit | Description |
|---------|-------------|
| **Single source of truth** | One schema, one location |
| **Type safety** | TypeScript types + JSON Schema validation |
| **Better indexing** | Timestamps enable chronological queries |
| **Extensible** | Schema version allows future evolution |
| **Simpler maintenance** | One writer, one validator, one test suite |

## Common Issues

### Issue: Old skills reference wrong paths

**Solution:** Update skills to use `thoughts/shared/handoffs/events/`

```bash
# Find skills with old paths
grep -r "thoughts/checkpoints\|thoughts/handoffs" .claude/skills/

# Update them
sed -i 's|thoughts/handoffs/<session>|thoughts/shared/handoffs/events|g' .claude/skills/*/SKILL.md
```

### Issue: Hooks expect old structure

**Solution:** Hooks have been updated in this release. If you have custom hooks, update them:

```typescript
// Old
const handoffPath = `thoughts/handoffs/${session}/${filename}.yaml`;

// New
import { ARTIFACT_DIR, generateFilename } from './shared/artifact-writer.js';
const handoffPath = join(ARTIFACT_DIR, generateFilename(timestamp, sessionId));
```

### Issue: Can't find old artifacts

**Solution:** Old artifacts remain in their original locations. To find them:

```bash
# List all old artifacts
find thoughts/{checkpoints,handoffs,finalize} -name "*.yaml" -o -name "*.md"

# Migrate them
cd opc && uv run python scripts/migrate/migrate_artifacts.py
```

## Schema Reference

See `.claude/hooks/src/shared/artifact-schema.ts` for the complete schema definition.

**Core fields (all event types):**
- `schema_version`: "1.0.0"
- `event_type`: "checkpoint" | "handoff" | "finalize"
- `timestamp`: ISO 8601 timestamp
- `session_id`: 8-character hex identifier
- `bead_id`: Optional bead reference (e.g., "bd-123")

**Content fields:**
- `goal`: What this session accomplished
- `current_status`: Current state
- `completed_this_session`: Array of completed tasks with files
- `next_steps`: What to do next
- `blockers`: Any blocking issues
- `decisions`: Key decisions with rationale
- `learnings`: What worked/failed
- `files_changed`: Files created/modified/deleted
- `git_metadata`: Branch, commit, remote info
- `outcome`: SUCCEEDED | PARTIAL_PLUS | PARTIAL_MINUS | FAILED

## Questions?

- **Schema issues**: Check `.claude/hooks/src/shared/artifact-schema.ts`
- **Migration problems**: Run with `--dry-run --verbose` first
- **Validation errors**: See `.claude/hooks/src/shared/artifact-validator.ts`
- **Integration issues**: Check test files in `.claude/hooks/__tests__/`

## Related Documentation

- [Unified Artifact System Plan](../thoughts/shared/plans/2026-01-13-unified-artifact-system.md)
- [Artifact Writer Source](../.claude/hooks/src/shared/artifact-writer.ts)
- [Schema Definition](../.claude/hooks/src/shared/artifact-schema.ts)
- [Validation Logic](../.claude/hooks/src/shared/artifact-validator.ts)
