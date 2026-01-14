/**
 * Tests for JSON Schema-based artifact validation
 */

import { describe, it, expect } from 'vitest';
import {
  validateArtifactSchema,
  assertValidArtifact,
  isValidArtifact,
  type ValidationError,
} from '../shared/artifact-validator.js';
import {
  createArtifact,
  type CheckpointArtifact,
  type HandoffArtifact,
  type FinalizeArtifact,
} from '../shared/artifact-schema.js';

describe('Artifact Validator', () => {
  describe('validateArtifactSchema', () => {
    it('should validate valid checkpoint artifact', () => {
      const artifact = createArtifact('checkpoint', 'Test goal', 'Test now', 'SUCCEEDED');
      const result = validateArtifactSchema(artifact);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should validate valid handoff artifact', () => {
      const artifact = createArtifact('handoff', 'Test goal', 'Test now', 'SUCCEEDED', {
        primary_bead: 'beads-123',
      });
      const result = validateArtifactSchema(artifact);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should validate valid finalize artifact', () => {
      const artifact = createArtifact('finalize', 'Test goal', 'Test now', 'SUCCEEDED', {
        primary_bead: 'beads-456',
      });
      const result = validateArtifactSchema(artifact);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it('should reject null', () => {
      const result = validateArtifactSchema(null);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it('should reject undefined', () => {
      const result = validateArtifactSchema(undefined);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should reject non-object', () => {
      const result = validateArtifactSchema('string');

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it('should reject array', () => {
      const result = validateArtifactSchema([]);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });
  });

  describe('Required Fields', () => {
    it('should reject missing schema_version', () => {
      const invalid = {
        event_type: 'checkpoint',
        timestamp: '2026-01-13T10:00:00Z',
        goal: 'Goal',
        now: 'Now',
        outcome: 'SUCCEEDED',
      };
      const result = validateArtifactSchema(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some(e => e.message.includes('schema_version'))).toBe(true);
    });

    it('should reject missing event_type', () => {
      const invalid = {
        schema_version: '1.0.0',
        timestamp: '2026-01-13T10:00:00Z',
        goal: 'Goal',
        now: 'Now',
        outcome: 'SUCCEEDED',
      };
      const result = validateArtifactSchema(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors!.some(e => e.message.includes('event_type'))).toBe(true);
    });

    it('should reject missing timestamp', () => {
      const invalid = {
        schema_version: '1.0.0',
        event_type: 'checkpoint',
        goal: 'Goal',
        now: 'Now',
        outcome: 'SUCCEEDED',
      };
      const result = validateArtifactSchema(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors!.some(e => e.message.includes('timestamp'))).toBe(true);
    });

    it('should reject missing goal', () => {
      const invalid = {
        schema_version: '1.0.0',
        event_type: 'checkpoint',
        timestamp: '2026-01-13T10:00:00Z',
        now: 'Now',
        outcome: 'SUCCEEDED',
      };
      const result = validateArtifactSchema(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors!.some(e => e.message.includes('goal'))).toBe(true);
    });

    it('should reject missing now', () => {
      const invalid = {
        schema_version: '1.0.0',
        event_type: 'checkpoint',
        timestamp: '2026-01-13T10:00:00Z',
        goal: 'Goal',
        outcome: 'SUCCEEDED',
      };
      const result = validateArtifactSchema(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors!.some(e => e.message.includes('now'))).toBe(true);
    });

    it('should reject missing outcome', () => {
      const invalid = {
        schema_version: '1.0.0',
        event_type: 'checkpoint',
        timestamp: '2026-01-13T10:00:00Z',
        goal: 'Goal',
        now: 'Now',
      };
      const result = validateArtifactSchema(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors!.some(e => e.message.includes('outcome'))).toBe(true);
    });
  });

  describe('Invalid Field Values', () => {
    it('should reject invalid event_type', () => {
      const invalid = {
        schema_version: '1.0.0',
        event_type: 'invalid',
        timestamp: '2026-01-13T10:00:00Z',
        goal: 'Goal',
        now: 'Now',
        outcome: 'SUCCEEDED',
      };
      const result = validateArtifactSchema(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors!.some(e =>
        e.message.includes('checkpoint') ||
        e.message.includes('handoff') ||
        e.message.includes('finalize')
      )).toBe(true);
    });

    it('should reject invalid outcome', () => {
      const invalid = {
        schema_version: '1.0.0',
        event_type: 'checkpoint',
        timestamp: '2026-01-13T10:00:00Z',
        goal: 'Goal',
        now: 'Now',
        outcome: 'INVALID',
      };
      const result = validateArtifactSchema(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors!.some(e => e.field.includes('outcome'))).toBe(true);
    });

    it('should reject invalid schema_version format', () => {
      const invalid = {
        schema_version: 'not-semver',
        event_type: 'checkpoint',
        timestamp: '2026-01-13T10:00:00Z',
        goal: 'Goal',
        now: 'Now',
        outcome: 'SUCCEEDED',
      };
      const result = validateArtifactSchema(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors!.some(e => e.field.includes('schema_version'))).toBe(true);
    });

    it('should reject invalid timestamp format', () => {
      const invalid = {
        schema_version: '1.0.0',
        event_type: 'checkpoint',
        timestamp: 'not-a-date',
        goal: 'Goal',
        now: 'Now',
        outcome: 'SUCCEEDED',
      };
      const result = validateArtifactSchema(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors!.some(e => e.field.includes('timestamp'))).toBe(true);
    });

    it('should reject empty goal', () => {
      const invalid = {
        schema_version: '1.0.0',
        event_type: 'checkpoint',
        timestamp: '2026-01-13T10:00:00Z',
        goal: '',
        now: 'Now',
        outcome: 'SUCCEEDED',
      };
      const result = validateArtifactSchema(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors!.some(e => e.field.includes('goal'))).toBe(true);
    });

    it('should reject empty now', () => {
      const invalid = {
        schema_version: '1.0.0',
        event_type: 'checkpoint',
        timestamp: '2026-01-13T10:00:00Z',
        goal: 'Goal',
        now: '',
        outcome: 'SUCCEEDED',
      };
      const result = validateArtifactSchema(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors!.some(e => e.field.includes('now'))).toBe(true);
    });
  });

  describe('Mode-Specific Validation', () => {
    it('should reject handoff without primary_bead', () => {
      const invalid = {
        schema_version: '1.0.0',
        event_type: 'handoff',
        timestamp: '2026-01-13T10:00:00Z',
        goal: 'Goal',
        now: 'Now',
        outcome: 'SUCCEEDED',
      };
      const result = validateArtifactSchema(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors!.some(e => e.message.includes('primary_bead'))).toBe(true);
    });

    it('should reject finalize without primary_bead', () => {
      const invalid = {
        schema_version: '1.0.0',
        event_type: 'finalize',
        timestamp: '2026-01-13T10:00:00Z',
        goal: 'Goal',
        now: 'Now',
        outcome: 'SUCCEEDED',
      };
      const result = validateArtifactSchema(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors!.some(e => e.message.includes('primary_bead'))).toBe(true);
    });

    it('should allow checkpoint without primary_bead', () => {
      const valid = {
        schema_version: '1.0.0',
        event_type: 'checkpoint',
        timestamp: '2026-01-13T10:00:00Z',
        goal: 'Goal',
        now: 'Now',
        outcome: 'SUCCEEDED',
      };
      const result = validateArtifactSchema(valid);

      expect(result.valid).toBe(true);
    });
  });

  describe('Complex Field Validation', () => {
    it('should validate this_session array with tasks', () => {
      const artifact: CheckpointArtifact = {
        schema_version: '1.0.0',
        event_type: 'checkpoint',
        timestamp: '2026-01-13T10:00:00Z',
        goal: 'Goal',
        now: 'Now',
        outcome: 'SUCCEEDED',
        this_session: [
          { task: 'Task 1', files: ['file1.ts'] },
          { task: 'Task 2', files: ['file2.ts', 'file3.ts'] },
        ],
      };
      const result = validateArtifactSchema(artifact);

      expect(result.valid).toBe(true);
    });

    it('should reject this_session with missing task', () => {
      const invalid = {
        schema_version: '1.0.0',
        event_type: 'checkpoint',
        timestamp: '2026-01-13T10:00:00Z',
        goal: 'Goal',
        now: 'Now',
        outcome: 'SUCCEEDED',
        this_session: [
          { files: ['file1.ts'] }, // Missing task
        ],
      };
      const result = validateArtifactSchema(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors!.some(e => e.message.includes('task'))).toBe(true);
    });

    it('should reject this_session with missing files', () => {
      const invalid = {
        schema_version: '1.0.0',
        event_type: 'checkpoint',
        timestamp: '2026-01-13T10:00:00Z',
        goal: 'Goal',
        now: 'Now',
        outcome: 'SUCCEEDED',
        this_session: [
          { task: 'Task 1' }, // Missing files
        ],
      };
      const result = validateArtifactSchema(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors!.some(e => e.message.includes('files'))).toBe(true);
    });

    it('should validate git metadata', () => {
      const artifact: CheckpointArtifact = {
        schema_version: '1.0.0',
        event_type: 'checkpoint',
        timestamp: '2026-01-13T10:00:00Z',
        goal: 'Goal',
        now: 'Now',
        outcome: 'SUCCEEDED',
        git: {
          branch: 'feat/test',
          commit: 'abc1234',
          remote: 'origin',
          pr_ready: 'https://github.com/user/repo/pull/123',
        },
      };
      const result = validateArtifactSchema(artifact);

      expect(result.valid).toBe(true);
    });

    it('should reject git metadata with missing required fields', () => {
      const invalid = {
        schema_version: '1.0.0',
        event_type: 'checkpoint',
        timestamp: '2026-01-13T10:00:00Z',
        goal: 'Goal',
        now: 'Now',
        outcome: 'SUCCEEDED',
        git: {
          branch: 'feat/test',
          // Missing commit
        },
      };
      const result = validateArtifactSchema(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors!.some(e => e.message.includes('commit'))).toBe(true);
    });

    it('should reject invalid pr_ready URL', () => {
      const invalid = {
        schema_version: '1.0.0',
        event_type: 'checkpoint',
        timestamp: '2026-01-13T10:00:00Z',
        goal: 'Goal',
        now: 'Now',
        outcome: 'SUCCEEDED',
        git: {
          branch: 'feat/test',
          commit: 'abc1234',
          pr_ready: 'not-a-url',
        },
      };
      const result = validateArtifactSchema(invalid);

      expect(result.valid).toBe(false);
      expect(result.errors!.some(e => e.field.includes('pr_ready'))).toBe(true);
    });
  });

  describe('assertValidArtifact', () => {
    it('should not throw for valid artifact', () => {
      const artifact = createArtifact('checkpoint', 'Goal', 'Now', 'SUCCEEDED');

      expect(() => {
        assertValidArtifact(artifact);
      }).not.toThrow();
    });

    it('should throw for invalid artifact with error details', () => {
      const invalid = {
        schema_version: '1.0.0',
        event_type: 'invalid',
        timestamp: '2026-01-13T10:00:00Z',
        goal: 'Goal',
        now: 'Now',
        outcome: 'SUCCEEDED',
      };

      expect(() => {
        assertValidArtifact(invalid);
      }).toThrow(/Artifact validation failed/);
    });

    it('should include field paths in error message', () => {
      const invalid = {
        schema_version: '1.0.0',
        event_type: 'checkpoint',
        timestamp: '2026-01-13T10:00:00Z',
        goal: 'Goal',
        now: 'Now',
        // Missing outcome
      };

      try {
        assertValidArtifact(invalid);
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as Error).message).toContain('outcome');
      }
    });
  });

  describe('isValidArtifact', () => {
    it('should return true for valid artifact', () => {
      const artifact = createArtifact('checkpoint', 'Goal', 'Now', 'SUCCEEDED');
      expect(isValidArtifact(artifact)).toBe(true);
    });

    it('should return false for invalid artifact', () => {
      const invalid = {
        schema_version: '1.0.0',
        event_type: 'invalid',
        timestamp: '2026-01-13T10:00:00Z',
        goal: 'Goal',
        now: 'Now',
        outcome: 'SUCCEEDED',
      };
      expect(isValidArtifact(invalid)).toBe(false);
    });

    it('should return false for null', () => {
      expect(isValidArtifact(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isValidArtifact(undefined)).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should validate artifact with all optional fields', () => {
      const artifact: CheckpointArtifact = {
        schema_version: '1.0.0',
        event_type: 'checkpoint',
        timestamp: '2026-01-13T10:00:00Z',
        session_id: 'sess-123',
        session_name: 'test-session',
        goal: 'Goal',
        now: 'Now',
        outcome: 'SUCCEEDED',
        this_session: [{ task: 'Task', files: ['file.ts'] }],
        next: ['Next 1', 'Next 2'],
        blockers: ['Blocker 1'],
        questions: ['Question 1'],
        decisions: { key: 'value' },
        learnings: {
          worked: ['Worked'],
          failed: ['Failed'],
        },
        findings: { finding: 'value' },
        git: {
          branch: 'feat/test',
          commit: 'abc123',
        },
        files: {
          created: ['new.ts'],
          modified: ['old.ts'],
          deleted: ['removed.ts'],
        },
        test: 'npm test',
        metadata: {
          custom: 'value',
        },
      };
      const result = validateArtifactSchema(artifact);

      expect(result.valid).toBe(true);
    });

    it('should validate handoff with all mode-specific fields', () => {
      const artifact: HandoffArtifact = {
        schema_version: '1.0.0',
        event_type: 'handoff',
        timestamp: '2026-01-13T10:00:00Z',
        goal: 'Goal',
        now: 'Now',
        outcome: 'SUCCEEDED',
        primary_bead: 'beads-123',
        related_beads: ['beads-100', 'beads-101'],
        files_to_review: [
          { path: 'file1.ts', note: 'New file' },
          { path: 'file2.ts' },
        ],
        continuation_prompt: 'Continue working...',
      };
      const result = validateArtifactSchema(artifact);

      expect(result.valid).toBe(true);
    });

    it('should validate finalize with all mode-specific fields', () => {
      const artifact: FinalizeArtifact = {
        schema_version: '1.0.0',
        event_type: 'finalize',
        timestamp: '2026-01-13T10:00:00Z',
        goal: 'Goal',
        now: 'Now',
        outcome: 'SUCCEEDED',
        primary_bead: 'beads-456',
        related_beads: ['beads-400'],
        final_solutions: [
          {
            problem: 'Problem 1',
            solution: 'Solution 1',
            rationale: 'Because reasons',
          },
        ],
        final_decisions: [
          {
            decision: 'Decision 1',
            rationale: 'Rationale',
            alternatives_considered: ['Alt 1', 'Alt 2'],
            why_this: 'Best option',
          },
        ],
        artifacts_produced: [
          { path: 'output.ts', note: 'Generated file' },
        ],
      };
      const result = validateArtifactSchema(artifact);

      expect(result.valid).toBe(true);
    });

    it('should accept metadata with any structure', () => {
      const artifact = createArtifact('checkpoint', 'Goal', 'Now', 'SUCCEEDED', {
        metadata: {
          custom_field: 'value',
          nested: { deep: { value: 123 } },
          array: [1, 2, 3],
          boolean: true,
        },
      });
      const result = validateArtifactSchema(artifact);

      expect(result.valid).toBe(true);
    });
  });
});
