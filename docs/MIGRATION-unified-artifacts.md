# Migration Guide: Unified Artifact System

## Overview

Continuous Claude now uses a unified artifact system. Checkpoints, handoffs, and finalize events share one schema and are stored in a single location.

## What Changed

### Old System (legacy)

```
.checkpoint/
  └── *.md
.handoff/
  └── *.md
```

### New System

```
thoughts/shared/handoffs/<session>/
  └── YYYY-MM-DD_HH-MM_<title>_<mode>.yaml
```

**Key changes:**
1. **Single location**: All artifacts go to `thoughts/shared/handoffs/<session>/`
2. **Unified schema**: Same structure for checkpoint, handoff, and finalize
3. **Timestamped filenames**: `2026-01-14_00-54_auth-refactor_handoff.yaml`
4. **YAML frontmatter**: Schema version and mode in metadata

## Schema Changes

### Old Format (legacy)

```markdown
**Date:** 2026-01-08 15:26
**Goal:** Example

## Accomplished
- Item 1
```

### New Format (unified)

```yaml
---
schema_version: "1.0.0"
mode: handoff
date: 2026-01-14T00:54:26.972Z
session: auth-refactor
primary_bead: Continuous-Claude-v3-ug8.6
---

goal: Feature X implementation
now: Finish integration tests
outcome: PARTIAL_PLUS
```

## Migration Script

If you have existing artifacts in the old format, run the migration script from the hooks package:

```bash
cd .claude/hooks
npm run migrate
```

**Dry run:**
```bash
cd .claude/hooks
npm run migrate:dry-run
```

**What it does:**
- Scans `.checkpoint/` and `.handoff/`
- Converts to unified schema
- Writes to `thoughts/shared/handoffs/<session>/`
- Preserves original files (non-destructive)
- Generates timestamped filenames

## For Developers

### Writing Code

**Old way:**
```python
# Separate writers for each type
from checkpoint_writer import write_checkpoint
from handoff_writer import write_handoff
```

**New way:**
```typescript
import { writeArtifact } from './shared/artifact-writer.js';
import { createArtifact } from './shared/artifact-schema.js';

const artifact = createArtifact('checkpoint', 'Goal', 'Now', 'PARTIAL_PLUS', {
  session: 'auth-refactor',
});
await writeArtifact(artifact);
```

### Schema Validation

```typescript
import { assertValidArtifact } from './shared/artifact-validator.js';
import type { UnifiedArtifact } from './shared/artifact-schema.js';

const artifact: UnifiedArtifact = { ... };
assertValidArtifact(artifact);  // throws if invalid
```

### Reading Artifacts

```bash
# Most recent artifact
ls -t thoughts/shared/handoffs/*/*.yaml | head -1

# Find by session ID
grep -l "session_id: 77ef540c" thoughts/shared/handoffs/*/*.yaml

# Find by bead ID
grep -l "primary_bead: Continuous-Claude-v3-ug8.6" thoughts/shared/handoffs/*/*.yaml
```

## Backward Compatibility

- Old artifacts are preserved (migration is non-destructive)
- New artifacts are written only to `thoughts/shared/handoffs/<session>/`

## Common Issues

### Issue: Old skills reference wrong paths

**Solution:** Update skills to use `thoughts/shared/handoffs/<session>/`

```bash
rg -n "\.checkpoint|\.handoff" .claude/skills
```

### Issue: Can't find old artifacts

**Solution:** They remain in `.checkpoint/` and `.handoff/`. Migrate when ready:

```bash
cd .claude/hooks
npm run migrate
```

## Schema Reference

See `.claude/hooks/src/shared/artifact-schema.ts` for the complete schema definition.
