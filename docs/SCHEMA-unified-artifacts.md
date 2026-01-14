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
| `finalize` | Session closure memorial | Task complete, celebrating success |

## Core Fields

### Required Metadata

```typescript
{
  schema_version: "1.0.0",           // Schema version
  event_type: "checkpoint" | "handoff" | "finalize",
  timestamp: "2026-01-14T00:54:26.972Z",  // ISO 8601
  session_id: "77ef540c",            // 8-char hex
}
```

### Optional Metadata

```typescript
{
  bead_id?: "bd-123",                // Bead reference
  project?: "my-project",            // Project identifier
  agent?: "claude-opus",             // Agent identifier
}
```

## Content Fields

### Goal & Status

```typescript
{
  goal: string,                      // What this session accomplished
  current_status: string,            // Current state (brief)
  progress_percentage?: number,      // 0-100 completion estimate
}
```

**Example:**
```yaml
goal: Implement user authentication with JWT tokens
current_status: Core auth logic complete, testing remains
progress_percentage: 75
```

### Completed Work

```typescript
{
  completed_this_session: Array<{
    task: string,                    // Task description
    files: string[],                 // Files touched
    notes?: string                   // Additional context
  }>
}
```

**Example:**
```yaml
completed_this_session:
  - task: Implement JWT token generation
    files: [auth/tokens.py, auth/utils.py]
    notes: Used PyJWT library, 24h expiry
  - task: Add login endpoint
    files: [api/routes.py, api/handlers.py]
```

### Next Steps

```typescript
{
  next_steps: string[],              // Ordered action items
  blockers?: string[],               // Blocking issues
  questions?: string[]               // Unresolved questions
}
```

**Example:**
```yaml
next_steps:
  - Write integration tests for login flow
  - Add password reset endpoint
  - Update API documentation

blockers:
  - Need clarification on token refresh strategy

questions:
  - Should we support OAuth2 in v1?
```

### Decisions

```typescript
{
  decisions?: Array<{
    decision: string,                // What was decided
    rationale?: string,              // Why this choice
    alternatives_considered?: string[],  // What else was considered
    why_this?: string                // Why this over alternatives
  }>
}
```

**Example:**
```yaml
decisions:
  - decision: Use PyJWT instead of python-jose
    rationale: Better maintained, simpler API
    alternatives_considered:
      - python-jose (deprecated)
      - authlib (too heavy)
    why_this: PyJWT is the de facto standard, 10K+ stars
```

### Learnings

```typescript
{
  learnings?: {
    worked?: string[],               // Successful approaches
    failed?: string[]                // What didn't work and why
  }
}
```

**Example:**
```yaml
learnings:
  worked:
    - FastAPI dependency injection made testing easy
    - Pytest fixtures for auth mocks worked well
  failed:
    - Tried to use sessions, too stateful for API
    - Redis for tokens was overkill, JWT simpler
```

### Files Changed

```typescript
{
  files_changed?: {
    created?: Array<{
      path: string,
      note?: string
    }>,
    modified?: Array<{
      path: string,
      note?: string
    }>,
    deleted?: Array<{
      path: string,
      note?: string
    }>
  }
}
```

**Example:**
```yaml
files_changed:
  created:
    - path: auth/tokens.py
      note: JWT token generation and validation
    - path: tests/test_auth.py
      note: Integration tests for auth endpoints
  modified:
    - path: api/routes.py
      note: Added /login and /logout endpoints
  deleted:
    - path: auth/sessions.py
      note: Removed session-based auth (switching to JWT)
```

### Git Metadata

```typescript
{
  git_metadata?: {
    branch?: string,                 // Current branch
    commit?: string,                 // Latest commit SHA
    remote?: string,                 // Remote URL
    status?: string                  // git status output
  }
}
```

**Example:**
```yaml
git_metadata:
  branch: feature/jwt-auth
  commit: a1b2c3d4
  remote: github.com/user/repo
  status: "3 files changed, 120 insertions(+), 40 deletions(-)"
```

### Session Outcome

```typescript
{
  outcome?: "SUCCEEDED" | "PARTIAL_PLUS" | "PARTIAL_MINUS" | "FAILED"
}
```

| Outcome | Meaning | Use When |
|---------|---------|----------|
| `SUCCEEDED` | Goal fully achieved | Task complete, tests pass |
| `PARTIAL_PLUS` | Most goals achieved | Minor issues remain |
| `PARTIAL_MINUS` | Some progress made | Major issues remain |
| `FAILED` | No meaningful progress | Task abandoned/blocked |

### Braintrust Metadata

```typescript
{
  braintrust?: {
    session_id?: string,             // Braintrust session ID
    trace_id?: string,               // Braintrust trace ID
    url?: string                     // Braintrust URL
  }
}
```

**Example:**
```yaml
braintrust:
  session_id: bt_abc123
  trace_id: tr_xyz789
  url: https://app.braintrust.dev/traces/tr_xyz789
```

## Complete Example

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
Implement JWT-based authentication for REST API

## Current Status
Core auth logic complete. Login/logout endpoints working. Testing and docs remain.

## Completed This Session
- task: Implement JWT token generation and validation
  files: [auth/tokens.py, auth/utils.py]
  notes: Using PyJWT, 24h expiry, HS256 algorithm
- task: Add login and logout API endpoints
  files: [api/routes.py, api/handlers.py]
  notes: /login returns JWT, /logout invalidates token

## Next Steps
1. Write integration tests for auth flow
2. Add password reset endpoint
3. Update API documentation

## Blockers
- Need clarification on token refresh strategy

## Decisions
- decision: Use PyJWT instead of python-jose
  rationale: Better maintained, simpler API, industry standard
  alternatives_considered: [python-jose, authlib]
  why_this: PyJWT is de facto standard with 10K+ stars

## Learnings
worked:
  - FastAPI dependency injection made testing easy
  - Pytest fixtures for auth mocks worked well
failed:
  - Tried sessions first, too stateful for REST API
  - Redis for tokens was overkill, JWT simpler

## Files Changed
created:
  - path: auth/tokens.py
    note: JWT generation and validation
  - path: tests/test_auth.py
    note: Auth endpoint integration tests
modified:
  - path: api/routes.py
    note: Added /login and /logout
  - path: requirements.txt
    note: Added PyJWT dependency

## Git Metadata
branch: feature/jwt-auth
commit: a1b2c3d4e5f6
remote: github.com/user/repo
status: "4 files changed, 250 insertions(+), 60 deletions(-)"

## Outcome
PARTIAL_PLUS
```

## Validation

The schema is validated at two levels:

### 1. TypeScript Compile-Time

```typescript
import type { UnifiedArtifact } from './artifact-schema.js';

// Type errors caught at compile time
const artifact: UnifiedArtifact = {
  schema_version: "1.0.0",
  event_type: "handoff",
  // ... TypeScript ensures all required fields present
};
```

### 2. Runtime Validation

```typescript
import { assertValidArtifact } from './artifact-validator.js';

// Throws if invalid
assertValidArtifact(artifact);
```

**Validation checks:**
- Required fields present
- Field types correct (string, array, object)
- Enum values valid (event_type, outcome)
- Timestamp format (ISO 8601)
- Session ID format (8-char hex)
- Nested objects well-formed

## Schema Evolution

Future schema changes will:
1. Increment `schema_version` (e.g., "1.1.0", "2.0.0")
2. Maintain backward compatibility when possible
3. Provide migration scripts for breaking changes
4. Document changes in this file

## Related Files

- **TypeScript Schema**: `.claude/hooks/src/shared/artifact-schema.ts`
- **JSON Schema**: `.claude/hooks/src/shared/artifact-schema.json`
- **Validator**: `.claude/hooks/src/shared/artifact-validator.ts`
- **Writer**: `.claude/hooks/src/shared/artifact-writer.ts`
- **Tests**: `.claude/hooks/__tests__/artifact-*.test.ts`

## Usage in Skills

Skills should use the writer function, not construct paths manually:

```typescript
import { writeArtifact } from './shared/artifact-writer.js';

// Build artifact object
const artifact: UnifiedArtifact = {
  schema_version: "1.0.0",
  event_type: "handoff",
  timestamp: new Date().toISOString(),
  session_id: generateSessionId(),
  goal: "...",
  // ... other fields
};

// Write (validates automatically)
await writeArtifact(artifact, 'handoff');
```

## Questions?

- **Field meanings**: See this document
- **Validation errors**: Check `.claude/hooks/src/shared/artifact-validator.ts`
- **Type definitions**: See `.claude/hooks/src/shared/artifact-schema.ts`
- **Examples**: See `.claude/hooks/__tests__/artifact-writer.test.ts`
