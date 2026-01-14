# Unified Artifact Schema

Comprehensive schema for checkpoint, handoff, and finalize artifacts in Continuous Claude.

## Overview

The unified artifact schema provides a single, extensible structure for capturing session state across three event types:

| Event Type | Purpose | Bead Required | Character |
|------------|---------|---------------|-----------|
| **checkpoint** | Quick snapshot | No | Open, flexible, minimal overhead |
| **handoff** | Transfer package | Yes | Strict, complete context for next session |
| **finalize** | Session memorial | Yes | Solutions, decisions, closure |

## Schema Version

**Current version:** `1.0.0`

Artifacts include a `schema_version` field to support format evolution while maintaining backward compatibility.

## Core Structure

### Common Fields (All Modes)

All artifacts share these base fields:

```typescript
{
  schema_version: string;     // e.g., "1.0.0"
  mode: "checkpoint" | "handoff" | "finalize";
  date: string;          // ISO 8601 date or date-time
  session: string;       // Session folder name (bead + slug)
  session_id?: string;

  goal: string;               // One-liner success criteria
  now: string;                // Current focus (one thing)
  outcome: "SUCCEEDED" | "PARTIAL_PLUS" | "PARTIAL_MINUS" | "FAILED";

  done_this_session?: CompletedTask[];
  next?: string[];
  blockers?: string[];
  questions?: string[];

  decisions?: Record<string, string> | Decision[];
  worked?: string[];
  failed?: string[];
  findings?: Record<string, string>;

  git?: {
    branch: string;
    commit: string;
    remote?: string;
    pr_ready?: string;          // URL if applicable
  };

  files?: {
    created?: string[];
    modified?: string[];
    deleted?: string[];
  };

  test?: string;
  metadata?: Record<string, unknown>;
}
```

### Mode-Specific Fields

#### Checkpoint (No Additional Fields)

Checkpoint is the lightest-weight mode, using only common fields.

#### Handoff (Additional Fields)

```typescript
{
  primary_bead: string;           // Required
  related_beads?: string[];
  files_to_review?: Array<{
    path: string;
    note?: string;
  }>;
  continuation_prompt?: string;   // Instructions for next session
}
```

#### Finalize (Additional Fields)

```typescript
{
  primary_bead: string;           // Required
  related_beads?: string[];
  final_solutions?: Array<{
    problem: string;
    solution: string;
    rationale: string;
  }>;
  final_decisions?: Decision[];
  artifacts_produced?: Array<{
    path: string;
    note?: string;
  }>;
}
```

## Type Definitions

### ArtifactMode

```typescript
type ArtifactMode = 'checkpoint' | 'handoff' | 'finalize';
```

### SessionOutcome

```typescript
type SessionOutcome =
  | 'SUCCEEDED'      // Goal achieved completely
  | 'PARTIAL_PLUS'   // Most goals achieved, minimal blockers
  | 'PARTIAL_MINUS'  // Some progress, significant blockers remain
  | 'FAILED';        // No meaningful progress
```

### CompletedTask

```typescript
interface CompletedTask {
  task: string;
  files: string[];
}
```

### Decision

```typescript
interface Decision {
  decision: string;
  rationale?: string;
  alternatives_considered?: string[];
  why_this?: string;
}
```

### FileReference

```typescript
interface FileReference {
  path: string;
  note?: string;
}
```

## Usage Examples

### Checkpoint

```typescript
import { createArtifact } from '@/shared/artifact-schema';

const checkpoint = createArtifact(
  'checkpoint',
  'Implement user authentication',
  'Writing JWT validation middleware',
  'PARTIAL_PLUS',
  {
    date: '2026-01-13T10:00:00Z',
    session: 'auth-refactor',
  }
);
```

### Handoff

```typescript
const handoff = createArtifact(
  'handoff',
  'Implement user authentication',
  'Complete logout endpoint',
  'PARTIAL_PLUS',
  {
    date: '2026-01-13T15:00:00Z',
    session: 'auth-refactor',
    primary_bead: 'beads-123',
  }
);

// Add handoff-specific fields
handoff.files_to_review = [
  { path: 'src/auth/jwt.ts', note: 'New JWT middleware' },
  { path: 'tests/auth.test.ts', note: '15 new tests' },
];
handoff.continuation_prompt = 'Continue with logout endpoint implementation';
```

### Finalize

```typescript
const finalize = createArtifact(
  'finalize',
  'Implement user authentication',
  'Session complete - all endpoints tested',
  'SUCCEEDED',
  {
    date: '2026-01-13T18:00:00Z',
    session: 'auth-refactor',
    primary_bead: 'beads-123',
  }
);

// Add finalize-specific fields
finalize.final_solutions = [
  {
    problem: 'JWT tokens too complex',
    solution: 'Switched to session-based auth with Redis',
    rationale: 'Simpler, no token refresh logic needed',
  },
];

finalize.artifacts_produced = [
  { path: 'src/auth/session.ts', note: 'Session model and Redis integration' },
  { path: 'docs/auth-migration.md', note: 'Migration guide from JWT' },
];
```

## Validation

### TypeScript Validation (Compile-Time)

```typescript
import { validateArtifact, UnifiedArtifact } from '@/shared/artifact-schema';

function processArtifact(data: unknown) {
  if (!validateArtifact(data)) {
    throw new Error('Invalid artifact structure');
  }

  // data is now typed as UnifiedArtifact
  const artifact: UnifiedArtifact = data;

  // Type guards
  if (isHandoff(artifact)) {
    console.log('Primary bead:', artifact.primary_bead);
  }
}
```

### JSON Schema Validation (Runtime)

The schema can be validated against `artifact-schema.json` using standard JSON Schema validators:

```typescript
import Ajv from 'ajv';
import artifactSchema from '@/shared/artifact-schema.json';

const ajv = new Ajv();
const validate = ajv.compile(artifactSchema);

if (!validate(data)) {
  console.error('Validation errors:', validate.errors);
}
```

## Type Guards

The schema exports type guard functions for safe type narrowing:

```typescript
import { isCheckpoint, isHandoff, isFinalize, requiresBead } from '@/shared/artifact-schema';

// Type guards return boolean and narrow types
if (isCheckpoint(artifact)) {
  // artifact is CheckpointArtifact
}

if (isHandoff(artifact)) {
  // artifact is HandoffArtifact
  console.log(artifact.primary_bead);
}

if (isFinalize(artifact)) {
  // artifact is FinalizeArtifact
  console.log(artifact.final_solutions);
}

// Check if event type requires a bead
if (requiresBead(artifact.mode)) {
  // Must have primary_bead field
}
```

## Extensibility

The schema supports extensibility through the `metadata` field:

```typescript
const artifact = createArtifact('checkpoint', goal, now, outcome, {
  session: 'auth-refactor',
  metadata: {
    custom_field: 'value',
    integration_data: { foo: 'bar' },
    experimental_feature: true,
  },
});
```

This allows:
- Custom fields without schema changes
- Integration-specific data
- Experimental features
- Backward compatibility

## YAML Serialization

Artifacts are typically stored as YAML files with frontmatter:

```yaml
---
schema_version: 1.0.0
mode: handoff
date: 2026-01-13T15:00:00Z
session: auth-refactor
outcome: PARTIAL_PLUS
primary_bead: beads-123
---

goal: Implement user authentication
now: Complete logout endpoint

done_this_session:
  - task: Implemented JWT middleware
    files: [src/auth/jwt.ts]
  - task: Added 15 unit tests
    files: [tests/auth.test.ts]

next:
  - Implement logout endpoint
  - Add session cleanup cron job

decisions:
  jwt_library: Chose jsonwebtoken over jose for better docs
  token_storage: Redis with 24h TTL

worked:
  - Pre-planning auth flow saved time
  - TDD approach caught edge cases early
failed:
  - Initial token refresh was too complex

files_to_review:
  - path: src/auth/jwt.ts
    note: New JWT middleware
  - path: tests/auth.test.ts
    note: 15 new tests

continuation_prompt: |
  Continue working on bead beads-123.
  Next: Implement logout endpoint at POST /auth/logout.
```

## Storage Convention

Artifacts are stored in: `thoughts/shared/handoffs/<session>/YYYY-MM-DD_HH-MM_<title>_<mode>.yaml`

Examples:
- `thoughts/shared/handoffs/auth-refactor/2026-01-14_00-54_auth-refactor_handoff.yaml`
- `thoughts/shared/handoffs/auth-refactor/2026-01-14_01-22_auth-refactor_checkpoint.yaml`
- `thoughts/shared/handoffs/auth-refactor/2026-01-14_02-39_auth-refactor_finalize.yaml`

## Migration from Legacy Formats

### From `.handoff/` (Legacy)

Old format:
```markdown
# Handoff: 2026-01-13

## Goal
Implement user authentication

## Current State
...
```

New format:
```yaml
---
schema_version: 1.0.0
mode: handoff
date: 2026-01-13T15:00:00Z
session: auth-refactor
primary_bead: beads-123
---

goal: Implement user authentication
...
```

### From `.checkpoint/` (Legacy)

Checkpoint artifacts now use the same unified schema with `mode: checkpoint`.

## Related Documentation

- **Plan**: `thoughts/shared/plans/2026-01-13-unified-artifact-system.md`
- **Implementation**: `.claude/hooks/src/shared/artifact-schema.ts`
- **Examples**: `thoughts/shared/handoffs/<session>/`
- **Slash Commands**: `~/.claude/commands/{checkpoint,handoff,finalize}.md`

## Version History

### 1.0.0 (2026-01-13)

Initial unified schema supporting:
- Three event types (checkpoint, handoff, finalize)
- Common fields across all modes
- Mode-specific extensions
- JSON Schema validation
- TypeScript type safety
- Extensible metadata
