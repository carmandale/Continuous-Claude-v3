# Automatic Continuity System

## Overview

Solve the "50 First Dates" problem where every session starts fresh with no memory of previous work. Implement automatic continuity that:

1. **Auto-loads context on ALL session starts** (not just resume/clear)
2. **Auto-extracts learnings in background** on session end
3. **Auto-creates checkpoints** when context >50%
4. **Auto-updates continuity ledger** when no checkpoint is created

All operations provide **clear, visible feedback** including size/token estimates.

## Problem Statement

Currently:
- Continuity ledger only loads on resume/clear/compact, NOT fresh startup
- Learning extraction is manual (memory-extractor agent exists but isn't called)
- No auto-checkpoint when context is high
- User has to re-explain context every session ("Drew Barrymore problem")

## Key Concepts

### Checkpoint vs Handoff

| **Checkpoint** | **Handoff** |
|----------------|-------------|
| Auto-save snapshot | Intentional transfer |
| "Save game" | "Pass the baton" |
| Captures state at moment | Clean context for new task |
| Created automatically (>50% context) | Created with `/create_handoff` |
| Lightweight | Comprehensive |

### Background Learning Extraction

Learnings extract **in background** after session ends:
- User exits immediately (no blocking)
- Results written to `.claude/cache/last-extraction.json`
- **Next session start** shows: `📚 Previous session: 3 learnings extracted`
- Delayed feedback, but no friction

## Research Findings

### Existing Infrastructure

| Component | Location | Status |
|-----------|----------|--------|
| `session-start-continuity.ts` | `.claude/hooks/src/` | Only loads on resume/clear/compact |
| `session-end-cleanup.ts` | `$HOME/.claude/hooks/src/` | Updates ledger timestamp, triggers Braintrust |
| `memory-extractor` agent | `.claude/agents/` | Exists but never auto-called |
| `store_learning.py` | `opc/scripts/core/` | Works, needs embedding deps |
| Context % tracking | `/tmp/claude-context-pct-*.txt` | Written by skill-activation-prompt |
| Transcript path | SessionEnd input | Available for learning extraction |

### Hook Registration

Current `settings.json`:
```json
"SessionStart": [
  { "matcher": "resume|compact|clear", ... }  // ← Excludes "startup"!
]
```

## Proposed Solution

### Session Flow Diagram

```
SESSION START:
┌─────────────────────────────────────────────────────────┐
│ 1. Load continuity ledger (ALL session types)           │
│    📋 Continuity loaded: auth-refactor (2.3kb/~575 tok) │
│                                                         │
│ 2. Show previous extraction results (if any)            │
│    📚 Previous session: 3 learnings extracted           │
│       - WORKING_SOLUTION: Session tokens work better... │
└─────────────────────────────────────────────────────────┘

SESSION END:
┌─────────────────────────────────────────────────────────┐
│ 1. Check context percentage                             │
│    ├─ >50%: 📸 Creating checkpoint... (context 67%)     │
│    └─ <50%: 📋 Updating ledger...                       │
│                                                         │
│ 2. Start background extraction                          │
│    🧠 Extracting learnings in background...             │
│                                                         │
│ 3. Exit immediately                                     │
└─────────────────────────────────────────────────────────┘
```

### Phase 1: SessionStart - Load on ALL Types + Show Previous Learnings

**File:** `.claude/hooks/src/session-start-continuity.ts`

**Changes:**
1. Remove the `startup` exclusion - load ledger on ALL session types
2. Add size/token feedback to output message
3. Read `.claude/cache/last-extraction.json` and show previous learnings
4. Add visual indicator that loading is happening (not frozen)

**Output Format:**
```
━━━ SESSION START ━━━
📋 Continuity loaded: auth-refactor (2.3kb / ~575 tokens)
   Goal: Replace JWT with session auth
   Now: Logout endpoint implementation

📚 Previous session extracted 3 learnings:
   • WORKING_SOLUTION: Session tokens work better than JWT for our use case
   • ERROR_FIX: Redis TTL must match frontend token refresh
   • CODEBASE_PATTERN: Use middleware for auth checks
━━━━━━━━━━━━━━━━━━━━━
```

### Phase 2: SessionEnd - Checkpoint + Background Extraction

**File:** `.claude/hooks/src/session-end-comprehensive.ts` (NEW)

**Flow:**
1. **Check context percentage** from `/tmp/claude-context-pct-*.txt`
2. **If context >50%**: Create checkpoint (inform, don't prompt)
3. **If context <50%**: Update continuity ledger with session summary
4. **Always**: Spawn background learning extraction (detached process)
5. **Exit immediately** - don't block user

**Output Format:**
```
━━━ SESSION END ━━━
📊 Context: 67%
📸 Creating checkpoint... (threshold: 50%)
   → thoughts/shared/checkpoints/auth-refactor/2026-01-10_07-30.md
🧠 Extracting learnings in background...
━━━━━━━━━━━━━━━━━━━━
```

Or for low context:
```
━━━ SESSION END ━━━
📊 Context: 34%
📋 Updating ledger with session summary...
🧠 Extracting learnings in background...
━━━━━━━━━━━━━━━━━━━━
```

### Phase 3: Background Learning Extraction

**File:** `.claude/hooks/src/background-learning-extractor.ts` (NEW)

**Runs as:** Detached child process (survives hook exit)

**Steps:**
1. Parse transcript for thinking blocks with perception signals
2. Classify each as REALIZATION/CORRECTION/INSIGHT/DEBUGGING_APPROACH
3. Store via `store_learning.py` with proper types
4. Write results to `.claude/cache/last-extraction.json`:

```json
{
  "timestamp": "2026-01-10T07:30:00Z",
  "session_id": "abc123",
  "learnings": [
    {
      "type": "WORKING_SOLUTION",
      "preview": "Session tokens work better than JWT for our use case",
      "stored": true
    }
  ],
  "error": null
}
```

### Phase 4: Checkpoint Generation

**Trigger:** Context percentage >50%

**Location:** `thoughts/shared/checkpoints/{session-name}/YYYY-MM-DD_HH-MM.md`

**Content:** Lightweight snapshot using existing `generateAutoHandoff()` (includes Ledger section)

**Difference from Handoff:**
- Checkpoints go in `checkpoints/` not `handoffs/`
- No outcome marking required
- Auto-generated, not user-curated

### Phase 5: Ledger Update (No Checkpoint Case)

**Trigger:** Session ends with context <50%

**Action:** Append session summary to existing continuity ledger:
- Files modified this session
- Brief summary of actions
- Timestamp

## Files to Create/Modify

- [ ] `.claude/hooks/src/session-start-continuity.ts` - Add startup loading, size feedback, show previous learnings
- [ ] `.claude/hooks/src/session-end-comprehensive.ts` - NEW: Main session end orchestrator
- [ ] `.claude/hooks/src/background-learning-extractor.ts` - NEW: Detached extraction process
- [ ] `.claude/settings.json` - Update SessionStart matcher, add new SessionEnd hook
- [ ] `thoughts/shared/checkpoints/` - NEW directory for auto-checkpoints

## Implementation Steps

### Step 1: Update SessionStart Hook
1. [ ] Change matcher from `resume|compact|clear` to `startup|resume|compact|clear` (or remove matcher entirely)
2. [ ] Add size calculation (bytes and estimated tokens)
3. [ ] Add reading of `.claude/cache/last-extraction.json`
4. [ ] Update output format with clear visual feedback
5. [ ] Test fresh startup loads ledger

### Step 2: Create Background Learning Extractor
1. [ ] Port logic from memory-extractor agent to standalone script
2. [ ] Add transcript parsing for perception signals
3. [ ] Integrate with store_learning.py via subprocess
4. [ ] Write results to last-extraction.json
5. [ ] Handle errors gracefully (write to json, don't crash)

### Step 3: Create Comprehensive SessionEnd Hook
1. [ ] Read context percentage from temp file
2. [ ] Implement checkpoint logic (>50%, inform user)
3. [ ] Implement ledger update (<50%)
4. [ ] Spawn background extractor (detached)
5. [ ] Format feedback output
6. [ ] Exit immediately

### Step 4: Create Checkpoints Directory Structure
1. [ ] Create `thoughts/shared/checkpoints/` 
2. [ ] Add to .gitignore or track in git (decision: track for visibility?)
3. [ ] Update checkpoint generation to use new location

### Step 5: Wire Up in settings.json
1. [ ] Update SessionStart to include startup
2. [ ] Add new SessionEnd hook to project settings
3. [ ] Rebuild hooks with `npm run build`

### Step 6: Test End-to-End
1. [ ] Fresh startup loads continuity
2. [ ] Fresh startup shows previous learnings (if any)
3. [ ] Session end at >50% creates checkpoint
4. [ ] Session end at <50% updates ledger
5. [ ] Background extraction completes and writes json
6. [ ] Next session shows extraction results
7. [ ] All feedback is visible and informative

## Technical Considerations

### Background Process Management
- Use `spawn()` with `detached: true` and `unref()`
- Use lock file to prevent multiple concurrent extractors
- Write PID to lock file for stale detection
- Max age for lock: 5 minutes (already implemented pattern)

### Performance
- Learning extraction runs after user exits - no impact on UX
- Checkpoint generation is fast (template-based)
- SessionStart reads small JSON file - negligible

### Error Handling
- All hooks fail gracefully (don't block session)
- Background errors written to last-extraction.json
- Log to stderr for debugging
- Always output valid JSON even on error

### Embedding Dependencies
- `sentence-transformers` required for local embeddings
- Falls back to text-only storage if not available
- Check and warn at extraction time, don't fail

## Acceptance Criteria

- [ ] Fresh `claude` startup shows continuity loaded with size info
- [ ] Fresh startup shows previous session's learnings (if any)
- [ ] Session end at >50% context shows checkpoint creation message
- [ ] Session end at <50% context shows ledger update message
- [ ] Session end shows "Extracting learnings in background..."
- [ ] User can exit immediately after session end message
- [ ] Next session shows "Previous session: N learnings extracted"
- [ ] All feedback includes size/token estimates where relevant
- [ ] No freezing or unclear waiting states

## Testing Strategy

- [ ] Unit: Background extractor parses sample transcripts correctly
- [ ] Unit: Size/token estimation is reasonable
- [ ] Unit: Last-extraction.json format is correct
- [ ] Integration: SessionStart loads ledger on fresh startup
- [ ] Integration: SessionStart shows previous learnings
- [ ] Integration: SessionEnd creates checkpoint at 60% context
- [ ] Integration: SessionEnd updates ledger at 30% context
- [ ] Integration: Background extraction completes after session
- [ ] Manual: Verify all feedback is clear and informative
- [ ] Manual: Verify user can exit immediately

## Open Questions - RESOLVED

| Question | Decision |
|----------|----------|
| Sync or async learning extraction? | **Background (async)** - results shown next session |
| Auto-handoff or checkpoint? | **Checkpoint** - lightweight auto-save, handoff is intentional |
| Prompt before checkpoint? | **No** - inform + continue, no blocking prompt |
| Track checkpoints in git? | TBD - probably yes for visibility |

## References

- Existing continuity hook: `.claude/hooks/src/session-start-continuity.ts`
- Memory extractor agent: `.claude/agents/memory-extractor.md`
- Transcript parser: `.claude/hooks/src/transcript-parser.ts`
- Store learning script: `opc/scripts/core/store_learning.py`
- Dynamic recall rule: `.claude/rules/dynamic-recall.md`
- Lock file pattern: `.claude/hooks/src/session-end-cleanup.ts`
