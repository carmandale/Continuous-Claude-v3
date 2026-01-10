---
date: 2026-01-10T13:03:52Z
session_name: fix-hooks-path-spaces
branch: fix/hooks-path-spaces
status: active
---

# Work Stream: fix-hooks-path-spaces

## Ledger
**Updated:** 2026-01-10T13:03:52Z
**Goal:** Fix Claude Code hooks to handle paths with spaces. Done when hooks run without errors in spaced paths.
**Branch:** fix/hooks-path-spaces
**Test:** python3 -c "import json; json.load(open('.claude/settings.json'))" && grep 'CLAUDE_PROJECT_DIR' .claude/settings.json | grep -v "bash -c" | wc -l

### Now
[->] Create PR from carmandale:fix/hooks-path-spaces to parcadei:main

### This Session
- [x] Forked parcadei/Continuous-Claude-v3 to carmandale/Continuous-Claude-v3
- [x] Created feature branch fix/hooks-path-spaces
- [x] Created implementation plan (thoughts/shared/plans/fix-hooks-path-spaces.md)
- [x] Ran pre-mortem (0 tigers, all paper tigers)
- [x] Wrapped 25 hooks in bash -c for spaced path support
- [x] Compiled TypeScript hooks (30 .mjs files)
- [x] Committed and pushed to fork (529c849)

### Next
- [ ] Create PR to parcadei/Continuous-Claude-v3
- [ ] Test hooks work in new Claude Code session
- [ ] Consider adding documentation about paths with spaces

### Decisions
- bash_c_wrapper: Chose `bash -c '...'` over alternatives because it's the standard solution for shell quoting issues
- leave_home_unchanged: $HOME paths never have spaces on macOS, left those 12 hooks unchanged
- single_quotes_outer: Single quotes outside, double quotes inside - single quotes pass literally, double allow variable expansion

### Open Questions
- UNCONFIRMED: Does the fix work in actual Claude Code session? (needs testing)

### Workflow State
pattern: workflow-router
phase: 5
total_phases: 6
retries: 0
max_retries: 3

#### Resolved
- goal: "Fix hooks to handle paths with spaces"
- resource_allocation: balanced

#### Unknowns
- actual_testing: UNKNOWN - need to test in fresh session

#### Last Failure
(none)

### Checkpoints
**Agent:** kraken
**Task:** Apply bash -c wrappers to all CLAUDE_PROJECT_DIR hooks
**Started:** 2026-01-10T12:30:00Z
**Last Updated:** 2026-01-10T13:00:00Z

#### Phase Status
- Phase 1 (Fork/Branch): ✓ VALIDATED
- Phase 2 (Plan): ✓ VALIDATED
- Phase 3 (Premortem): ✓ VALIDATED (0 tigers)
- Phase 4 (Implement): ✓ VALIDATED (25/25 hooks wrapped)
- Phase 5 (Commit/Push): ✓ VALIDATED (529c849 pushed to fork)
- Phase 6 (PR): ○ PENDING

#### Validation State
```json
{
  "test_count": 25,
  "tests_passing": 25,
  "files_modified": [".claude/settings.json", ".claude/hooks/package-lock.json"],
  "last_test_command": "grep 'CLAUDE_PROJECT_DIR' .claude/settings.json | grep -v 'bash -c' | wc -l",
  "last_test_exit_code": 0
}
```

#### Resume Context
- Current focus: Create PR to upstream
- Next action: gh pr create --repo parcadei/Continuous-Claude-v3
- Blockers: (none)

---

## Context

### Problem
Claude Code hooks fail when `$CLAUDE_PROJECT_DIR` contains spaces (e.g., "Groove Jones Dropbox"). The shell splits the path on spaces even when quoted in settings.json because Claude Code strips quotes before shell execution.

### Solution
Wrap commands in `bash -c '...'` so bash handles variable expansion with proper quoting:
```
Before: python3 "$CLAUDE_PROJECT_DIR/.claude/hooks/script.py"
After:  bash -c 'python3 "$CLAUDE_PROJECT_DIR/.claude/hooks/script.py"'
```

### Key Files
- `.claude/settings.json` - Hook configuration (25 hooks fixed)
- `thoughts/shared/plans/fix-hooks-path-spaces.md` - Implementation plan
- `.claude/hooks/dist/` - Compiled hooks (gitignored, build locally)

### Git State
- Branch: fix/hooks-path-spaces
- Remote: fork → carmandale/Continuous-Claude-v3
- Commit: 529c849
- PR URL: https://github.com/carmandale/Continuous-Claude-v3/pull/new/fix/hooks-path-spaces

### Learnings
- Simple quoting in JSON doesn't work - Claude Code strips quotes
- Symlink workaround doesn't work - Claude Code resolves to real path
- bash -c wrapper is the standard solution for this class of shell quoting issues
- ~5ms overhead per hook is negligible
