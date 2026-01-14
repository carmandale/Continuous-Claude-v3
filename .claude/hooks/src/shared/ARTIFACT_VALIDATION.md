# Artifact Validation

JSON Schema-based validation for unified artifacts (checkpoint, handoff, finalize).

## Quick Start

```typescript
import { validateArtifactSchema, assertValidArtifact, isValidArtifact } from './artifact-validator.js';
import { createArtifact } from './artifact-schema.js';

// Create artifact
const artifact = createArtifact('checkpoint', 'Implement auth', 'Writing tests', 'PARTIAL_PLUS');

// Validate and get detailed errors
const result = validateArtifactSchema(artifact);
if (!result.valid) {
  console.error('Validation errors:', result.errors);
  // errors: [{ field: '/outcome', message: 'Invalid value: must be one of...', value: 'INVALID' }]
}

// Assert validation (throws on failure)
try {
  assertValidArtifact(artifact);
  // Safe to write artifact
  await writeArtifact(artifact);
} catch (error) {
  console.error('Invalid artifact:', error.message);
  // Message includes all validation errors with field paths
}

// Boolean check
if (isValidArtifact(artifact)) {
  await writeArtifact(artifact);
}
```

## API

### `validateArtifactSchema(artifact: unknown): ValidationResult`

Validate artifact against JSON Schema. Returns detailed errors.

**Returns:**
```typescript
{
  valid: boolean;
  errors?: ValidationError[];  // Only present if valid=false
}
```

**ValidationError:**
```typescript
{
  field: string;        // JSON path (e.g., "/goal", "/git/commit")
  message: string;      // Human-readable error
  value?: unknown;      // The invalid value
}
```

### `assertValidArtifact(artifact: unknown): asserts artifact is UnifiedArtifact`

Validate and throw on failure. Use for write-time validation.

**Throws:** Error with formatted message listing all validation errors.

### `isValidArtifact(artifact: unknown): artifact is UnifiedArtifact`

Boolean convenience for conditional logic.

## Validation Rules

### Required Fields (All Modes)

- `schema_version`: Semver format (e.g., "1.0.0")
- `event_type`: "checkpoint" | "handoff" | "finalize"
- `timestamp`: ISO 8601 date-time
- `goal`: Non-empty string
- `now`: Non-empty string
- `outcome`: "SUCCEEDED" | "PARTIAL_PLUS" | "PARTIAL_MINUS" | "FAILED"

### Mode-Specific Requirements

**Handoff & Finalize:**
- `primary_bead`: Required string

**Checkpoint:**
- No additional requirements (lightest weight)

### Optional Field Validation

When present, these fields are validated:

- `session_id`, `session_name`: Non-empty strings
- `this_session[]`: Array of `{task: string, files: string[]}`
- `next[]`, `blockers[]`, `questions[]`: String arrays
- `decisions`: Object or Decision array
- `learnings`: `{worked?: string[], failed?: string[]}`
- `findings`: Key-value object
- `git`: `{branch: string, commit: string, remote?: string, pr_ready?: uri}`
- `files`: `{created?: string[], modified?: string[], deleted?: string[]}`
- `test`: String (command)
- `metadata`: Any structure (extensibility)

**Handoff-specific:**
- `related_beads[]`: String array
- `files_to_review[]`: `{path: string, note?: string}`
- `continuation_prompt`: String

**Finalize-specific:**
- `related_beads[]`: String array
- `final_solutions[]`: `{problem, solution, rationale}`
- `final_decisions[]`: Decision objects
- `artifacts_produced[]`: `{path: string, note?: string}`

## Error Messages

Clear, actionable error messages with field paths:

```
Artifact validation failed:
  • /event_type: Invalid value: must be one of checkpoint, handoff, finalize
    Got: "invalid"
  • /outcome: Missing required field: outcome
  • /primary_bead: Missing required field: primary_bead
  • /timestamp: Invalid format: expected date-time
    Got: "not-a-date"
```

## Integration Example

```typescript
// In writeArtifact() function
export async function writeArtifact(artifact: unknown, filePath: string): Promise<void> {
  // Validate before write
  assertValidArtifact(artifact);

  // Safe to proceed - artifact is guaranteed valid
  const content = YAML.stringify(artifact);
  await writeFile(filePath, content, 'utf-8');
}
```

## Schema Location

- **JSON Schema:** `artifact-schema.json`
- **TypeScript Types:** `artifact-schema.ts`
- **Validator:** `artifact-validator.ts`
- **Tests:** `__tests__/artifact-validator.test.ts`

## Performance

- Schema loaded and compiled once (cached)
- Validation is fast (~1ms for typical artifacts)
- Zero runtime overhead for valid artifacts

## Testing

```bash
npm test -- artifact-validator
```

39 test cases covering:
- Valid artifacts (all modes)
- Required field validation
- Invalid field values
- Mode-specific rules
- Complex nested structures
- Edge cases
