---
description: Create handoff document for transferring work to another session
---

# Create Handoff

You are tasked with writing a handoff document to hand off your work to another agent in a new session. This is a **session transfer** - capturing current state for continuation in a new session.

## When to Use

Use `/handoff` when:
- You need to transfer work to another session (ongoing work)
- A session is ending but work continues
- You want to preserve context for the next session
- Handing off mid-task or between milestones

**Key difference from /finalize:**
- **Handoff**: Transfer ongoing work to next session
- **Finalize**: Memorial of completed work (closure)

## Process

### 1. Gather Session Context

First, determine the bead you're working on:

```bash
bd list --status=in_progress
```

If no bead is in progress, handoff requires a bead - ask the user which bead to hand off.

### 2. Create Unified Artifact

This skill uses the unified artifact system. Write the artifact in YAML frontmatter format to:

```
thoughts/shared/handoffs/events/YYYY-MM-DDTHH-MM-SS.sssZ_sessionid.md
```

**Filename format:**
- `YYYY-MM-DDTHH-MM-SS.sssZ`: ISO timestamp with colons replaced by hyphens
- `sessionid`: 8-character hex identifier (generate random if not available)
- Example: `2026-01-14T01-23-45.678Z_abc12345.md`

### 3. Required Fields

**Core fields (all artifacts):**
- `schema_version`: "1.0.0"
- `event_type`: "handoff"
- `timestamp`: ISO 8601 timestamp (e.g., "2026-01-14T01:23:45.678Z")
- `goal`: What this session accomplished
- `now`: What next session should do first
- `outcome`: SUCCEEDED | PARTIAL_PLUS | PARTIAL_MINUS | FAILED
- `primary_bead`: The bead being handed off (REQUIRED for handoff)

**Handoff-specific fields:**
- `related_beads`: Array of related bead IDs (optional)
- `files_to_review`: Array of {path, note} objects for next session (optional)
- `continuation_prompt`: Specific instructions for resuming (optional)

**Optional but recommended:**
- `session_id`: 8-char hex identifier
- `session_name`: Descriptive session name
- `this_session`: Array of completed tasks with files
- `next`: Array of next steps
- `blockers`: Array of blocking issues
- `questions`: Array of unresolved questions
- `decisions`: Record of key decisions (simple format) or array of Decision objects
- `learnings`: Object with `worked` and `failed` arrays
- `findings`: Record of key discoveries
- `git`: Branch, commit, remote, pr_ready
- `files`: Object with created, modified, deleted arrays
- `test`: Command to verify the work

### 4. YAML Format

```yaml
---
schema_version: "1.0.0"
event_type: handoff
timestamp: 2026-01-14T01:23:45.678Z
session_id: abc12345
session_name: descriptive-name
goal: What this session accomplished
now: What next session should do first
outcome: PARTIAL_PLUS
primary_bead: Continuous-Claude-v3-ug8.6
---

this_session:
  - task: First completed task
    files:
      - path/to/file1.ts
      - path/to/file2.ts
  - task: Second completed task
    files:
      - path/to/file3.ts

next:
  - First step for next session
  - Second step for next session

blockers:
  - Blocking issue 1
  - Blocking issue 2

questions:
  - Unresolved question 1
  - Unresolved question 2

decisions:
  decision_name: Rationale for this decision

learnings:
  worked:
    - Approach that worked
  failed:
    - Approach that failed and why

findings:
  key_finding: Details about this finding

related_beads:
  - beads-xxx
  - beads-yyy

files_to_review:
  - path: src/important-file.ts
    note: Focus on the authentication logic here

continuation_prompt: |
  Start by reviewing the auth flow in src/auth.ts.
  The next step is to implement the refresh token logic.

git:
  branch: feat/auth-system
  commit: abc1234
  remote: origin
  pr_ready: "no"

files:
  created:
    - new-file.ts
  modified:
    - existing-file.ts

test: npm test
```

### 5. Mark Session Outcome (REQUIRED)

**IMPORTANT:** Before responding to the user, you MUST ask about the session outcome.

Use the AskUserQuestion tool with these exact options:

```
Question: "How did this session go?"
Options:
  - SUCCEEDED: Task completed successfully
  - PARTIAL_PLUS: Mostly done, minor issues remain
  - PARTIAL_MINUS: Some progress, major issues remain
  - FAILED: Task abandoned or blocked
```

After the user responds, the outcome is included in the YAML.

### 6. Confirm Completion

Respond to the user:

```
Handoff created! Outcome: [OUTCOME]

Resume in a new session with:
/resume_handoff thoughts/shared/handoffs/events/[filename]
```

---

## Example Handoff Structure

```yaml
---
schema_version: "1.0.0"
event_type: handoff
timestamp: 2026-01-14T01:23:45.678Z
session_id: abc12345
session_name: refactor-handoff-skill
goal: Refactor /handoff to use unified artifact system
now: Continue testing the refactored handoff skill
outcome: PARTIAL_PLUS
primary_bead: Continuous-Claude-v3-ug8.6
---

this_session:
  - task: Updated handoff skill to use unified schema
    files:
      - .claude/skills/create_handoff/SKILL.md
  - task: Created CLI wrapper for writeArtifact
    files:
      - .claude/hooks/src/write-handoff-cli.ts

next:
  - Test handoff skill with real session
  - Verify YAML validation works
  - Update documentation

blockers:
  - Need to verify CLI script builds correctly

related_beads:
  - Continuous-Claude-v3-ug8.1
  - Continuous-Claude-v3-ug8.2

files_to_review:
  - path: .claude/hooks/src/shared/artifact-writer.ts
    note: Core writer implementation
  - path: .claude/hooks/src/shared/artifact-schema.ts
    note: Schema definitions

continuation_prompt: |
  Test the updated handoff skill by creating a real handoff.
  Verify the YAML format matches the schema.

learnings:
  worked:
    - Unified schema approach simplifies skill implementation
  failed:
    - Initial attempt to call TypeScript from bash was complex

git:
  branch: feat/continuity-system
  commit: fb84207
  pr_ready: "no"

files:
  modified:
    - .claude/skills/create_handoff/SKILL.md
  created:
    - .claude/hooks/src/write-handoff-cli.ts

test: npm test --prefix .claude/hooks
```

---

## Additional Notes

- **Be thorough and concise**: Include key details without excessive verbosity
- **Avoid large code snippets**: Use file:line references (e.g., `src/file.ts:42-56`)
- **Focus on context**: What does the next session need to know?
- **Link files**: Reference important files with notes for next session
- **primary_bead is REQUIRED**: Handoff must be tied to a bead
- **Use continuation_prompt**: Give specific instructions for resuming work

This skill provides a structured handoff for ongoing work, ensuring smooth continuation in the next session.
