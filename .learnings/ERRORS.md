# Errors Log

## [ERR-20260114-001] cc-artifact

**Logged**: 2026-01-14T03:16:31Z
**Priority**: medium
**Status**: resolved
**Area**: docs

### Summary
Attempted to run `cc-artifact` without absolute path; command not found.

### Error
```
zsh:1: command not found: cc-artifact
```

### Context
- Command: `cc-artifact --mode checkpoint --goal "Test unified artifact" --now "Validate cc-artifact" --outcome SUCCEEDED --no-edit --output /tmp/...`
- Environment: shell PATH did not include `~/.claude/scripts`

### Suggested Fix
Invoke via absolute path (`~/.claude/scripts/cc-artifact`) or add that directory to PATH.

### Metadata
- Reproducible: yes
- Related Files: .claude/scripts/cc-artifact
- Source: error

### Resolution
- **Resolved**: 2026-01-14T03:18:00Z
- **Notes**: Updated `cc-artifact` to detect and use python3/python.

---
## [ERR-20260114-003] agentmail-macro-start-session

**Logged**: 2026-01-14T12:03:02Z
**Priority**: medium
**Status**: pending
**Area**: infra

### Summary
`macro_start_session` failed with "Too many open files" when starting Agent Mail session.

### Error
```
Error calling tool 'macro_start_session': Too many open files. Freed 1 cached repos. Retry the operation.
```

### Context
- Command: `macro_start_session` (Agent Mail)
- Input: project path `/Users/dalecarman/Groove Jones Dropbox/Dale Carman/Projects/dev/Continuous-Claude-v3`
- Environment: local agent mail server (sqlite)

### Suggested Fix
Retry the operation after cache cleanup; investigate Agent Mail repo caching limits if recurring.

### Metadata
- Reproducible: unknown
- Related Files: N/A
- Source: error

---
## [ERR-20260114-002] cc-artifact-python

**Logged**: 2026-01-14T03:16:45Z
**Priority**: medium
**Status**: resolved
**Area**: infra

### Summary
`cc-artifact` failed because `python` is not on PATH.

### Error
```
/Users/dalecarman/.claude/scripts/cc-artifact: line 104: python: command not found
```

### Context
- Command: `~/.claude/scripts/cc-artifact --mode checkpoint ...`
- Environment: only `python3` available (no `python` symlink)

### Suggested Fix
Use `python3` (or detect python3/python) in `cc-artifact`.

### Metadata
- Reproducible: yes
- Related Files: .claude/scripts/cc-artifact
- Source: error

### Resolution
- **Resolved**: 2026-01-14T03:18:30Z
- **Notes**: Updated commands/skills to call `~/.claude/scripts/cc-artifact` explicitly.

---
