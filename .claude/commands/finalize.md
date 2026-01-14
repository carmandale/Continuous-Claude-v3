---
description: Final memorial artifact (bead required). Captures final solutions + decisions. Uses ~/.claude/scripts/cc-artifact.
---

You are closing a session with a **finalize** artifact that records solutions, decisions, and closure.

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
If none: STOP and ask the user which bead to finalize (or create one).

### 2) Generate the finalize artifact
```bash
~/.claude/scripts/cc-artifact --mode finalize --bead <BEAD_ID> [--session-title "<short title>"]
```
Fill in `goal`, `now`, and `outcome`. Capture `final_solutions`, `final_decisions`, and `artifacts_produced`.

### 3) Confirm outcome
Ask the user for outcome (SUCCEEDED / PARTIAL_PLUS / PARTIAL_MINUS / FAILED) and ensure the artifact reflects it.

### 4) (Optional) Close bead
```bash
bd close <BEAD_ID> --reason "Completed"
```

### 5) Commit + push
```bash
git add thoughts/shared/handoffs/*/*.yaml
git commit -m "finalize: <short description>"
git push
```

### 6) Sync beads
```bash
bd sync
```

## Output
Report:
- Artifact path
- Primary bead
- Outcome
- Whether bead was closed
- Commit SHA
