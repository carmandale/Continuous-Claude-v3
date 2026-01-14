---
description: Mid-session snapshot (bead optional). Uses ~/.claude/scripts/cc-artifact.
---

Create a **checkpoint** artifact to preserve mid-session progress.

This command uses the unified artifact generator: `~/.claude/scripts/cc-artifact`.

## Requirements
- Bead is optional
- Artifact must be written to `thoughts/shared/handoffs/<session>/`
- Outcome is required
- Auto-commit is required (checkpoint should be recorded)

## Steps

### 1) Check bead context (optional)
```bash
bd list --status in_progress --json
```
If a bead is relevant, use it as `--bead`.

### 2) Generate the checkpoint artifact
```bash
~/.claude/scripts/cc-artifact --mode checkpoint [--bead <BEAD_ID>] [--session-title "<short title>"]
```
Fill in `goal`, `now`, and `outcome`. Add optional fields (`done_this_session`, `next`, `worked`, `failed`, etc.) as needed.

### 3) Confirm outcome
Ask the user for outcome (SUCCEEDED / PARTIAL_PLUS / PARTIAL_MINUS / FAILED) and ensure the artifact reflects it.

### 4) Commit the artifact
```bash
git add thoughts/shared/handoffs/*/*.yaml
git commit -m "checkpoint: <short description>"
```

### 5) (Optional) Push
If the user wants it shared immediately:
```bash
git push
```

## Output
Report:
- Artifact path
- Primary bead (if any)
- Outcome
- Commit SHA
- Resume command: `/resume_handoff <artifact-path>`
