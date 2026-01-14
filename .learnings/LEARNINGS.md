## [LRN-20260114-001] correction

**Logged**: 2026-01-14T20:37:47Z
**Priority**: high
**Status**: pending
**Area**: config

### Summary
cc-artifact interactive flow caused confusion and incorrect bead usage; needs a non-interactive, bead-verified path.

### Details
User feedback highlighted a frustrating cc-artifact experience where the agent did not identify the correct bead, created a new bead without confirmation, and struggled with interactive editor edits (vim), leading to a chaotic process and loss of trust.

### Suggested Action
Add a non-interactive mode for cc-artifact (flags or stdin) that validates bead existence (prefer in_progress or require explicit ID) and writes required fields without opening an editor. Improve prompts/errors to prevent creating beads without confirmation.

### Metadata
- Source: user_feedback
- Related Files: .claude/scripts/cc-artifact
- Tags: tooling, ux, bead
- See Also: 

---
