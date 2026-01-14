---
description: Create checkpoint snapshot of current session state
---

# Checkpoint Session

You are tasked with writing a checkpoint document to capture the current state of your session. This is a **quick snapshot** - lightweight and flexible, no bead required. Use it to save progress mid-session.

## When to Use

Use `/checkpoint` when:
- You want to save current progress without formal handoff
- Taking a break mid-session and want to preserve state
- Experimenting and want to mark a known-good state
- No bead required - can be used anytime

**Key differences:**
- **Checkpoint**: Quick snapshot, no bead required, flexible
- **Handoff**: Transfer to next session, bead required, structured
- **Finalize**: Session memorial, bead required, comprehensive

## Process

### 1. Gather Session Context

Checkpoint doesn't require a bead, but if one exists, capture it:

```bash
bd list --status=in_progress
```

### 2. Use writeArtifact() Function

This skill uses the unified artifact system. Call writeArtifact() from the hook system:

```typescript
// In .claude/hooks - this is conceptual, actual implementation in hooks
import { writeArtifact } from './src/shared/artifact-writer.js';
import { createArtifact } from './src/shared/artifact-schema.js';

const artifact = createArtifact(
  'checkpoint',  // mode
  'Current progress on task',
  'What to focus on next',
  'PARTIAL_PLUS',  // or SUCCEEDED, PARTIAL_MINUS, FAILED
  {
    session: 'auth-refactor',
    session_id: 'abc12345',
    primary_bead: 'beads-xxx',  // Optional - include if working on a bead
  }
);

const path = await writeArtifact(artifact);
```

### 3. Required Fields

**Core fields (all artifacts):**
- `goal`: What you're working on in this session
- `now`: Current focus / what's happening now
- `outcome`: SUCCEEDED | PARTIAL_PLUS | PARTIAL_MINUS | FAILED
- `session`: Session folder name (bead + slug)

**Optional but recommended:**
- `primary_bead`: Bead ID if working on one (optional for checkpoint)
- `session_id`: 8-char hex identifier
- `done_this_session`: Array of completed work so far
- `next`: What to do next
- `blockers`: Current blockers or issues
- `questions`: Open questions
- `decisions`: Quick decisions made
- `worked`: What worked well
- `failed`: What didn't work and why
- `git`: Branch, commit info
- `files`: Files touched so far

### 4. Output Location

All checkpoint artifacts are written to:
```
thoughts/shared/handoffs/<session>/YYYY-MM-DD_HH-MM_<title>_checkpoint.yaml
```

**Filename format:**
- `YYYY-MM-DD_HH-MM`: Date and time (UTC)
- `<title>`: Slugified session title
- Example: `2026-01-14_01-23_auth-bug-investigation_checkpoint.yaml`

### 5. Using CLI Wrapper (Alternative)

There's a CLI wrapper for direct bash usage (note: it does NOT auto-gather git metadata):

```bash
# From project root
node .claude/hooks/dist/write-checkpoint-cli.mjs \
  --goal "Current work description" \
  --now "Current focus" \
  --outcome PARTIAL_PLUS \
  --session-title "auth-bug-investigation" \
  --primary_bead beads-xxx  # Optional
```

The CLI will:
1. Generate date and session folder name
2. Validate against schema
3. Write to unified location
4. Return the artifact path

## Checkpoint Philosophy

Checkpoints are **lightweight and forgiving**:
- No bead requirement (though you can include one)
- Quick to create (minimal required fields)
- Flexible structure (include what's useful)
- Low ceremony (just save state and continue)

Use them liberally to mark progress points. They're cheaper than losing context.

## Example Checkpoint

Minimal checkpoint (just the essentials):

```yaml
---
schema_version: "1.0.0"
mode: checkpoint
date: 2026-01-14T01:23:45.678Z
session: auth-bug-investigation
session_id: abc12345
outcome: PARTIAL_PLUS
---

goal: Investigating auth bug in login flow
now: Tracing request through middleware chain

done_this_session:
  - task: Reproduced bug locally
    files:
      - src/auth/login.ts
  - task: Added debug logging

next:
  - Check middleware order
  - Test with different user roles

blockers:
  - Need staging database access to verify

git:
  branch: debug/auth-bug
  commit: abc1234
```

Full checkpoint (with details):

```yaml
---
schema_version: "1.0.0"
mode: checkpoint
date: 2026-01-14T01:23:45.678Z
session: auth-bug-investigation
session_id: abc12345
primary_bead: beads-123
outcome: PARTIAL_PLUS
---

goal: Fix authentication bug in login flow
now: Testing middleware ordering hypothesis

done_this_session:
  - task: Reproduced bug with specific user role
    files:
      - src/auth/login.ts
      - tests/auth/test_login.py
  - task: Added comprehensive logging
    files:
      - src/middleware/auth-middleware.ts
  - task: Traced request flow through 5 middleware layers

next:
  - Reorder middleware to fix auth sequence
  - Add integration test for this scenario
  - Update documentation

blockers:
  - Staging DB access needed for full test
  - Waiting on security team review

questions:
  - Should we backport fix to v2.x branch?
  - Is this worth a hotfix release?

decisions:
  middleware_order: Move auth check before rate limiting

worked:
  - Debug logging revealed exact failure point
  - Integration tests caught the regression
failed:
  - Unit tests alone weren't sufficient
  - Initial hypothesis about JWT was wrong

git:
  branch: fix/auth-middleware-order
  commit: def5678
  remote: origin
  pr_ready: false

files:
  modified:
    - src/auth/login.ts
    - src/middleware/auth-middleware.ts
  created:
    - tests/integration/test_auth_flow.py
```

## Schema Validation

All checkpoints are validated against the unified schema before writing. If validation fails, you'll see an error with details about what's missing or incorrect.

Required by schema:
- `schema_version`: "1.0.0"
- `mode`: "checkpoint"
- `date`: ISO 8601 date or date-time
- `session`: session folder name
- `goal`: non-empty string
- `now`: non-empty string
- `outcome`: one of the valid enum values

## Tips

1. **Use checkpoints liberally** - they're cheap and help preserve context
2. **Keep goal/now concise** - these show in statuslines and summaries
3. **Capture "why" not just "what"** - decisions and learnings are valuable
4. **Include bead if working on one** - creates traceability
5. **Mark blockers explicitly** - helps next session know what's stuck

## Integration

The checkpoint system integrates with:
- **Session continuity**: SessionStart hook can read latest checkpoint
- **Bead tracking**: Links work to bead IDs
- **Git workflow**: Captures branch/commit context
- **Memory system**: Learnings can be extracted for future sessions
