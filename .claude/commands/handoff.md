---
description: Strict session transfer package (bead required). Uses ~/.claude/scripts/cc-artifact.
---

You are ending a session and handing off work to another session/agent.

This command uses the unified artifact generator: `~/.claude/scripts/cc-artifact`.

## Requirements
- **Bead REQUIRED**
- Artifact must be written to `thoughts/shared/handoffs/<session>/`
- Outcome is required
- Commit + push required

## Steps

### 1) Confirm primary bead
```bash
bd list --status in_progress --json
```
If none: STOP and ask the user which bead to use (or create one).

### 2) Generate the handoff artifact
```bash
~/.claude/scripts/cc-artifact --mode handoff --bead <BEAD_ID> [--session-title "<short title>"]
```
Fill in `goal`, `now`, and `outcome`. Include concrete next steps and files to review.

### 3) Confirm outcome
Ask the user for outcome (SUCCEEDED / PARTIAL_PLUS / PARTIAL_MINUS / FAILED) and ensure the artifact reflects it.

### 4) Commit + push
```bash
git add thoughts/shared/handoffs/*/*.yaml
git commit -m "handoff: <short description>"
git push
```

### 5) Sync beads
```bash
bd sync
```

## Output
Report:
- Artifact path
- Primary bead
- Outcome
- Commit SHA
- Resume command: `/resume_handoff <artifact-path>`
