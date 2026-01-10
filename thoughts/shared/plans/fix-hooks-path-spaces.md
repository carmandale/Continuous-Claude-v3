# Implementation Plan: Fix Claude Code Hooks for Paths with Spaces

Generated: 2026-01-10

## Goal

Fix all Claude Code hooks in `.claude/settings.json` to properly handle paths containing spaces (e.g., "Groove Jones Dropbox"). Currently, hooks fail because Claude Code strips quotes before shell execution, causing word splitting on spaces.

## Problem Analysis

**Root Cause:** When `$CLAUDE_PROJECT_DIR` contains spaces like `/Users/dalecarman/Groove Jones Dropbox/...`, the shell interprets each word as a separate argument:
- `python3` receives `/Users/dalecarman/Groove` as the script path
- `Jones` and `Dropbox/...` become additional arguments

**Why Quotes Don't Work:** Even with escaped quotes in settings.json:
```json
"command": "python3 \"$CLAUDE_PROJECT_DIR/.claude/hooks/script.py\""
```
Claude Code strips the quotes before passing to the shell, so word splitting still occurs.

**Solution:** Wrap commands in `bash -c '...'` so bash itself handles variable expansion with proper quoting:
```json
"command": "bash -c 'python3 \"$CLAUDE_PROJECT_DIR/.claude/hooks/script.py\"'"
```

## Existing Codebase Analysis

### Hooks Using `$CLAUDE_PROJECT_DIR` (Must Fix - 22 hooks)

| Hook Event | Command | Timeout |
|------------|---------|---------|
| statusLine | `python3 "$CLAUDE_PROJECT_DIR/.claude/scripts/status.py"` | - |
| PreToolUse | `node "$CLAUDE_PROJECT_DIR/.claude/hooks/dist/pre-tool-use-broadcast.mjs"` | - |
| PreToolUse | `node "$CLAUDE_PROJECT_DIR/.claude/hooks/dist/path-rules.mjs"` | 5 |
| PreToolUse | `node "$CLAUDE_PROJECT_DIR/.claude/hooks/dist/tldr-read-enforcer.mjs"` | 20 |
| PreToolUse | `node "$CLAUDE_PROJECT_DIR/.claude/hooks/dist/smart-search-router.mjs"` | 10 |
| PreToolUse | `node "$CLAUDE_PROJECT_DIR/.claude/hooks/dist/tldr-context-inject.mjs"` | 30 |
| PreToolUse | `node "$CLAUDE_PROJECT_DIR/.claude/hooks/dist/arch-context-inject.mjs"` | 30 |
| PreToolUse | `node "$CLAUDE_PROJECT_DIR/.claude/hooks/dist/file-claims.mjs"` | 5 |
| PreToolUse | `node "$CLAUDE_PROJECT_DIR/.claude/hooks/dist/edit-context-inject.mjs"` | 5 |
| PreToolUse | `node "$CLAUDE_PROJECT_DIR/.claude/hooks/dist/signature-helper.mjs"` | 5 |
| SessionStart | `node "$CLAUDE_PROJECT_DIR/.claude/hooks/dist/session-register.mjs"` | 10 |
| SessionStart | `python3 "$CLAUDE_PROJECT_DIR/.claude/hooks/session-symbol-index.py"` | 5 |
| SessionStart | `node "$CLAUDE_PROJECT_DIR/.claude/hooks/dist/session-start-tldr-cache.mjs"` | 5 |
| SessionStart | `node "$CLAUDE_PROJECT_DIR/.claude/hooks/dist/session-start-dead-code.mjs"` | 30 |
| UserPromptSubmit | `python3 "$CLAUDE_PROJECT_DIR/.claude/hooks/premortem-suggest.py"` | 5 |
| UserPromptSubmit | `node "$CLAUDE_PROJECT_DIR/.claude/hooks/dist/memory-awareness.mjs"` | 10 |
| UserPromptSubmit | `node "$CLAUDE_PROJECT_DIR/.claude/hooks/dist/impact-refactor.mjs"` | 10 |
| PostToolUse | `node "$CLAUDE_PROJECT_DIR/.claude/hooks/dist/compiler-in-the-loop.mjs"` | 30 |
| PostToolUse | `node "$CLAUDE_PROJECT_DIR/.claude/hooks/dist/post-edit-notify.mjs"` | 5 |
| PostToolUse | `node "$CLAUDE_PROJECT_DIR/.claude/hooks/dist/post-edit-diagnostics.mjs"` | 10 |
| PostToolUse | `node "$CLAUDE_PROJECT_DIR/.claude/hooks/dist/import-validator.mjs"` | 5 |
| PostToolUse | `node "$CLAUDE_PROJECT_DIR/.claude/hooks/dist/import-error-detector.mjs"` | 5 |
| Stop | `python3 "$CLAUDE_PROJECT_DIR/.claude/hooks/auto-handoff-stop.py"` | - |
| Stop | `bash "$CLAUDE_PROJECT_DIR/.claude/plugins/braintrust-tracing/hooks/stop_hook.sh"` | - |
| Stop | `node "$CLAUDE_PROJECT_DIR/.claude/hooks/dist/compiler-in-the-loop-stop.mjs"` | - |

### Hooks Using `$HOME` (Do NOT Fix - 10 hooks)

These use `$HOME` which never contains spaces:

| Hook Event | Command |
|------------|---------|
| PreCompact | `node "$HOME/.claude/hooks/dist/pre-compact-continuity.mjs"` |
| SessionStart | `bash "$HOME/.claude/plugins/braintrust-tracing/hooks/session_start.sh"` |
| SessionStart | `node "$HOME/.claude/hooks/dist/session-start-continuity.mjs"` |
| UserPromptSubmit | `node "$HOME/.claude/hooks/dist/skill-activation-prompt.mjs"` |
| UserPromptSubmit | `bash "$HOME/.claude/plugins/braintrust-tracing/hooks/user_prompt_submit.sh"` |
| PostToolUse | `node "$HOME/.claude/hooks/dist/typescript-preflight.mjs"` |
| PostToolUse | `node "$HOME/.claude/hooks/dist/handoff-index.mjs"` |
| PostToolUse | `python3 "$HOME/.claude/hooks/post-tool-use-tracker.py"` |
| PostToolUse | `bash "$HOME/.claude/plugins/braintrust-tracing/hooks/post_tool_use.sh"` |
| SessionEnd | `node "$HOME/.claude/hooks/dist/session-end-cleanup.mjs"` |
| SessionEnd | `node "$HOME/.claude/hooks/dist/session-outcome.mjs"` |
| SessionEnd | `bash "$HOME/.claude/plugins/braintrust-tracing/hooks/session_end.sh"` |

## Implementation Phases

### Phase 1: Transform Commands

**Files to modify:**
- `.claude/settings.json` - all hook commands using `$CLAUDE_PROJECT_DIR`

**Transformation Pattern:**

For each interpreter type:

| Original | Fixed |
|----------|-------|
| `python3 "$CLAUDE_PROJECT_DIR/..."` | `bash -c 'python3 "$CLAUDE_PROJECT_DIR/..."'` |
| `node "$CLAUDE_PROJECT_DIR/..."` | `bash -c 'node "$CLAUDE_PROJECT_DIR/..."'` |
| `bash "$CLAUDE_PROJECT_DIR/..."` | `bash -c 'bash "$CLAUDE_PROJECT_DIR/..."'` |

**Implementation Steps:**

1. For statusLine (line 4):
   ```json
   // Before
   "command": "python3 \"$CLAUDE_PROJECT_DIR/.claude/scripts/status.py\""
   // After
   "command": "bash -c 'python3 \"$CLAUDE_PROJECT_DIR/.claude/scripts/status.py\"'"
   ```

2. For each PreToolUse hook using `$CLAUDE_PROJECT_DIR`:
   - Lines 12, 21, 31, 41, 51, 56, 66, 71, 76

3. For each SessionStart hook using `$CLAUDE_PROJECT_DIR`:
   - Lines 101, 106, 125, 130

4. For each UserPromptSubmit hook using `$CLAUDE_PROJECT_DIR`:
   - Lines 145, 150, 155

5. For each PostToolUse hook using `$CLAUDE_PROJECT_DIR`:
   - Lines 176, 181, 186, 224, 234

6. For each Stop hook using `$CLAUDE_PROJECT_DIR`:
   - Lines 245, 249, 253

**Acceptance criteria:**
- [ ] All 22 hooks using `$CLAUDE_PROJECT_DIR` wrapped in `bash -c '...'`
- [ ] All timeout values preserved
- [ ] Hooks using `$HOME` remain unchanged
- [ ] JSON remains valid

### Phase 2: Validation

**Steps:**

1. Validate JSON syntax:
   ```bash
   python3 -c "import json; json.load(open('.claude/settings.json'))"
   ```

2. Test a hook manually with spaces in path:
   ```bash
   # Simulate what Claude Code does
   cd "/Users/dalecarman/Groove Jones Dropbox/Dale Carman/Projects/dev/Continuous-Claude-v3"
   export CLAUDE_PROJECT_DIR="$PWD"

   # Test one hook
   bash -c 'python3 "$CLAUDE_PROJECT_DIR/.claude/hooks/premortem-suggest.py"'
   ```

3. Verify hooks work in actual Claude Code session

**Acceptance criteria:**
- [ ] JSON parses without error
- [ ] Manual test executes without "No such file" error
- [ ] Claude Code session starts without hook errors

## Testing Strategy

1. **Syntax validation**: Parse JSON with Python to catch syntax errors
2. **Manual execution**: Run fixed command pattern in shell with spaced path
3. **Integration test**: Start new Claude Code session and verify no hook errors in output

## Risks & Considerations

| Risk | Mitigation |
|------|------------|
| Breaking working hooks | Only modify `$CLAUDE_PROJECT_DIR` hooks, not `$HOME` |
| JSON syntax errors | Validate JSON after changes |
| Double-wrapping already-wrapped | Verify current state before transforming |
| Performance overhead | `bash -c` adds ~5ms latency per hook - negligible |

## Alternative Approaches Considered

1. **Use `env` command**: `env bash -c ...` - adds no benefit
2. **Use array syntax**: JSON hooks don't support array command syntax
3. **Fix in Claude Code**: Would require CLI update; out of our control
4. **Symlink without spaces**: Would break for other users with spaces in paths

The `bash -c` wrapper is the standard solution for this class of shell quoting issues.

## Estimated Complexity

**Low** - Pure find-and-replace transformation with clear pattern. No logic changes, no new code.

- Time estimate: 10-15 minutes
- Risk level: Low
- Rollback: Revert settings.json from git

## Commands Summary

```bash
# Validate after changes
python3 -c "import json; json.load(open('.claude/settings.json'))"

# Test pattern
export CLAUDE_PROJECT_DIR="/Users/dalecarman/Groove Jones Dropbox/Dale Carman/Projects/dev/Continuous-Claude-v3"
bash -c 'echo "Test: $CLAUDE_PROJECT_DIR"'  # Should print full path

# Count hooks to verify (should be 22 CLAUDE_PROJECT_DIR, 10 HOME)
grep -c 'CLAUDE_PROJECT_DIR' .claude/settings.json
grep -c '\$HOME' .claude/settings.json
```
