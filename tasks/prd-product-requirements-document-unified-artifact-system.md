# Product Requirements Document: Unified Artifact System

**Version:** 1.0  
**Status:** Draft  
**Owner:** Continuous Claude Team  
**Created:** 2026-01-13

---

## Executive Summary

Consolidate the checkpoint, handoff, and finalize workflows into a single unified artifact system using `thoughts/shared/handoffs/` as the canonical storage location. This eliminates duplication, simplifies the codebase, and provides a consistent schema for session continuity artifacts.

---

## Problem Statement

Currently, we have three separate artifact systems:
- `.checkpoint/` - mid-session state saves
- `.handoff/` - session transfer documents  
- Finalize events - end-of-session summaries

This creates:
- **Code duplication** - similar logic in multiple places
- **Inconsistent schemas** - each format differs slightly
- **Maintenance burden** - changes require updating 3+ locations
- **User confusion** - unclear which artifact type to use when

---

## Goals

### Primary Goals
1. **Single source of truth** - `thoughts/shared/handoffs/` becomes the canonical location for all session artifacts
2. **Unified schema** - consistent structure across checkpoint/handoff/finalize event types
3. **Simplified codebase** - remove duplication, consolidate writer functions
4. **Backward compatibility** - existing artifacts remain accessible during migration

### Non-Goals
- **Changing core concepts** - checkpoint/handoff/finalize remain distinct event types
- **Breaking existing workflows** - `/checkpoint`, `/handoff`, `/finalize` skills still work
- **New features** - focus is consolidation, not new capabilities

---

## User Stories

### As a developer using Claude Code
- I want all my session artifacts in one place (`thoughts/shared/handoffs/`)
- I want consistent structure so tooling (hooks, viewers) works uniformly
- I want the system to handle event types automatically (checkpoint vs handoff vs finalize)

### As a skill developer
- I want a single writer function to create artifacts instead of maintaining separate implementations
- I want clear schema definitions so I know what fields are available
- I want extensibility via metadata for custom fields

### As a system maintainer
- I want reduced code duplication across checkpoint/handoff/finalize
- I want one place to update when schema changes
- I want migration path from old formats documented

---

## Requirements

### Functional Requirements

#### FR1: Unified Schema
**Priority:** P0 (Critical)

The system MUST support a unified artifact schema with:
- `event_type`: One of `checkpoint`, `handoff`, `finalize`
- `timestamp`: ISO 8601 timestamp of artifact creation
- `session_id`: Session identifier
- `bead_id`: Optional bead tracking ID
- `content`: Markdown content body
- `metadata`: Extensible object for custom fields

**Example:**
```yaml
event_type: handoff
timestamp: 2026-01-13T15:30:00Z
session_id: abc123
bead_id: beads-456
content: |
  ## Summary
  Completed auth refactor
metadata:
  git_branch: feat/auth
  files_changed: 5
```

#### FR2: Storage Location
**Priority:** P0 (Critical)

All artifacts MUST be stored in:
```
thoughts/shared/handoffs/events/<filename>
```

Where `<filename>` follows pattern:
```
YYYY-MM-DDTHH-MM-SS.sssZ_<hash>.md
```

#### FR3: Event Type Routing
**Priority:** P0 (Critical)

Skills MUST specify event type:
- `/checkpoint` → `event_type: checkpoint`
- `/handoff` → `event_type: handoff`
- `/finalize` → `event_type: finalize`

#### FR4: Writer Function Consolidation
**Priority:** P1 (High)

Replace separate implementations with single writer:
```typescript
writeArtifact({
  eventType: 'checkpoint' | 'handoff' | 'finalize',
  content: string,
  sessionId: string,
  beadId?: string,
  metadata?: Record<string, any>
})
```

#### FR5: Backward Compatibility
**Priority:** P2 (Medium)

Provide migration script to convert:
- `.checkpoint/*.md` → `thoughts/shared/handoffs/events/*.md` (type=checkpoint)
- `.handoff/*.md` → `thoughts/shared/handoffs/events/*.md` (type=handoff)

#### FR6: Hook Integration
**Priority:** P1 (High)

Update `handoff-index` hook to:
- Index unified artifacts from `thoughts/shared/handoffs/events/`
- Support filtering by `event_type`
- Maintain existing functionality

---

### Non-Functional Requirements

#### NFR1: Performance
- Artifact writes MUST complete in <100ms
- Index operations MUST handle 1000+ artifacts efficiently

#### NFR2: Reliability
- Schema validation MUST catch invalid artifacts before write
- File write failures MUST not leave partial/corrupt artifacts

#### NFR3: Maintainability
- Code duplication MUST be eliminated across checkpoint/handoff/finalize
- Schema changes MUST only require updates in one location

---

## Implementation Phases

### Phase 1: Foundation (Week 1)
**Goal:** Unified schema + basic writer

**Tasks:**
1. Define unified schema (TypeScript interface + JSON schema)
2. Implement `writeArtifact()` writer function
3. Add schema validation
4. Unit tests for writer + validation

**Acceptance Criteria:**
- ✓ Schema documented and validated
- ✓ Writer function creates valid artifacts in `thoughts/shared/handoffs/events/`
- ✓ Tests pass

### Phase 2: Skill Refactor (Week 2)
**Goal:** Update skills to use unified system

**Tasks:**
1. Refactor `/checkpoint` to use `writeArtifact()` with type=checkpoint
2. Refactor `/handoff` to use `writeArtifact()` with type=handoff
3. Refactor `/finalize` to use `writeArtifact()` with type=finalize
4. Integration tests for each skill

**Acceptance Criteria:**
- ✓ All three skills write to unified location
- ✓ Existing skill interfaces unchanged (backward compatible)
- ✓ Tests pass

### Phase 3: Migration + Cleanup (Week 3)
**Goal:** Remove old formats, enable migration

**Tasks:**
1. Create migration script (`.checkpoint/` + `.handoff/` → unified format)
2. Update `handoff-index` hook to index unified artifacts
3. Documentation updates
4. Remove old writer implementations

**Acceptance Criteria:**
- ✓ Migration script tested on real artifacts
- ✓ Hook indexes new format correctly
- ✓ Documentation reflects new system
- ✓ Old code removed

---

## Success Metrics

### Technical Metrics
- **Code reduction:** 40% reduction in artifact-related code
- **Schema consistency:** 100% of artifacts follow unified schema
- **Test coverage:** >80% for artifact system

### User Metrics
- **Artifact findability:** All artifacts in one predictable location
- **Hook reliability:** handoff-index hook works with unified format
- **Migration success:** Existing artifacts successfully converted

---

## Dependencies

### Technical Dependencies
- TypeScript for schema definitions
- JSON Schema for validation
- Existing skill framework (`~/.claude/skills/`)
- Handoff-index hook infrastructure

### External Dependencies
- None

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Migration breaks existing workflows | High | Test migration on copy of artifacts first |
| Schema too rigid for future needs | Medium | Include `metadata` object for extensibility |
| Hook update breaks indexing | High | Deploy hook update with feature flag |
| Users have custom tooling reading old format | Medium | Document migration path, provide 30-day transition |

---

## Open Questions

1. **Retention policy:** Should old `.checkpoint/` and `.handoff/` directories be deleted after migration? → **Answer:** Yes, after successful migration validation
2. **Metadata standards:** Should we define standard metadata fields (e.g., `git_branch`, `files_changed`)? → **Answer:** Define in Phase 2 based on skill needs
3. **Versioning:** Should schema include version field for future evolution? → **Answer:** Yes, add `schema_version: "1.0"`

---

## Appendix: Schema Definition

### TypeScript Interface
```typescript
interface UnifiedArtifact {
  schema_version: "1.0"
  event_type: "checkpoint" | "handoff" | "finalize"
  timestamp: string // ISO 8601
  session_id: string
  bead_id?: string
  content: string // Markdown
  metadata?: Record<string, any>
}
```

### JSON Schema
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["schema_version", "event_type", "timestamp", "session_id", "content"],
  "properties": {
    "schema_version": { "type": "string", "const": "1.0" },
    "event_type": { "type": "string", "enum": ["checkpoint", "handoff", "finalize"] },
    "timestamp": { "type": "string", "format": "date-time" },
    "session_id": { "type": "string" },
    "bead_id": { "type": "string" },
    "content": { "type": "string" },
    "metadata": { "type": "object" }
  }
}
```