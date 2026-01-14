# Shared Utilities

Centralized utilities and type definitions for Claude Code hooks.

## Contents

### Artifact Schema (`artifact-schema.ts`)

Unified schema for checkpoint, handoff, and finalize artifacts.

**Quick Start:**

```typescript
import { createArtifact, validateArtifact } from './artifact-schema.js';

// Create checkpoint
const checkpoint = createArtifact('checkpoint', 'Goal', 'Now', 'PARTIAL_PLUS');

// Create handoff (requires bead)
const handoff = createArtifact('handoff', 'Goal', 'Now', 'SUCCEEDED', {
  primary_bead: 'beads-123',
});

// Validate
if (validateArtifact(data)) {
  // data is UnifiedArtifact
}
```

**Documentation:** See `docs/artifact-schema.md` for comprehensive guide.

**Tests:** See `__tests__/artifact-schema.test.ts` for usage examples.

### Type Definitions (`types.ts`)

Common hook input/output types:
- `PreToolUseInput`, `PostToolUseInput`
- `SubagentStartInput`, `SubagentStopInput`
- `PreToolUseHookOutput`, `LegacyHookOutput`

### Database Utilities (`db-utils.ts`)

Database access helpers:
- `getDbPath()` - Get path to pattern state DB
- `queryDb()` - Execute SQL queries
- `registerAgent()`, `completeAgent()` - Agent lifecycle

### Memory Client (`memory-client.ts`)

Semantic memory integration:
- `searchMemory()` - Query past learnings
- `storeMemory()` - Store new learnings
- `isMemoryAvailable()` - Check availability

### Pattern Router (`pattern-router.ts`, `pattern-selector.ts`)

Multi-agent pattern detection and selection:
- `detectPattern()` - Identify coordination pattern
- `selectPattern()` - Choose optimal pattern
- `validateComposition()` - Validate pattern chains

### Workflow Erotetic (`workflow-erotetic.ts`)

Question-driven clarification system:
- `extractPropositions()` - Extract claims from text
- `generateClarificationQuestions()` - Generate Q-heuristics
- `evaluateEroteticGate()` - Gate implementation tasks

### Erotetic Questions (`erotetic-questions.ts`)

Q-heuristic generation and resolution:
- `getQHeuristicsForTask()` - Get questions for task type
- `resolveFromContext()` - Auto-resolve from context
- `formatAskUserQuestions()` - Format for AskUserQuestion tool

### Resource Utilities (`resource-utils.ts`, `resource-reader.ts`)

Resource access helpers:
- `getSystemResources()` - System info (platform, env vars)
- `readResourceState()` - Read pattern state from resources
- `getResourceFilePath()` - Resolve resource paths

### Skill Router Types (`skill-router-types.ts`)

Type definitions for skill routing system:
- `SkillRouterInput`, `SkillRouterOutput`
- `SkillRule`, `SkillTrigger`
- `CircularDependencyError`

### Task Detector (`task-detector.ts`)

Implementation task detection:
- `detectTask()` - Identify if user message is implementation request
- Returns confidence score and reasoning

### Composition Gate (`composition-gate.ts`)

Gate 3: Pattern composition validation:
- `gate3Composition()` - Validate single composition
- `gate3CompositionChain()` - Validate composition chain

### Python Bridge (`python-bridge.ts`)

Python script execution helpers:
- `callValidateComposition()` - Call Python validator
- `callPatternInference()` - Call Python inference

### Project State (`project-state.ts`)

Project metadata management:
- Read/write project state
- Track active patterns

### Spec Context (`spec-context.ts`)

Specification context extraction:
- Parse spec files
- Extract requirements

### Learning Extractor (`learning-extractor.ts`)

Extract learnings from session artifacts:
- Parse thinking blocks
- Extract decisions and patterns

## Usage Patterns

### Import from Index

All shared utilities are re-exported from `index.ts`:

```typescript
import {
  createArtifact,
  validateArtifact,
  isCheckpoint,
  type UnifiedArtifact,
  searchMemory,
  detectPattern,
} from './shared/index.js';
```

### Type Safety

All utilities provide full TypeScript type definitions:

```typescript
import type { UnifiedArtifact, PreToolUseInput } from './shared/index.js';

function handleArtifact(artifact: UnifiedArtifact) {
  if (isCheckpoint(artifact)) {
    // artifact is CheckpointArtifact
  }
}
```

### Testing

Test utilities are located in `__tests__/`:
- Use `vitest` for running tests
- Follow existing test patterns
- Use type guards for type narrowing

## Development

### Adding New Utilities

1. Create utility file in `src/shared/`
2. Add exports to `src/shared/index.ts`
3. Add tests in `src/__tests__/`
4. Update this README

### Running Tests

```bash
npm test                    # Run all tests
npm test artifact-schema    # Run specific test
npm run test:watch          # Watch mode
```

### Type Checking

```bash
npm run check               # TypeScript type check
```

### Building

```bash
npm run build               # Build all hooks to dist/
```

## Related Documentation

- **Artifact Schema**: `docs/artifact-schema.md`
- **Pattern System**: `thoughts/shared/plans/2025-12-28-pattern-aware-hooks.md`
- **Erotetic Gates**: `thoughts/shared/plans/workflow-erotetic-gates.md`
