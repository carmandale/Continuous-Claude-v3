/**
 * Tests for unified artifact schema
 */

import { describe, it, expect } from 'vitest';
import {
  ARTIFACT_SCHEMA_VERSION,
  createArtifact,
  validateArtifact,
  isCheckpoint,
  isHandoff,
  isFinalize,
  requiresBead,
  type CheckpointArtifact,
  type HandoffArtifact,
  type FinalizeArtifact,
} from '../shared/artifact-schema.js';

describe('Artifact Schema', () => {
  describe('Schema Version', () => {
    it('should export valid semver version', () => {
      expect(ARTIFACT_SCHEMA_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
      expect(ARTIFACT_SCHEMA_VERSION).toBe('1.0.0');
    });
  });

  describe('createArtifact', () => {
    it('should create valid checkpoint artifact', () => {
      const artifact = createArtifact(
        'checkpoint',
        'Test goal',
        'Test now',
        'PARTIAL_PLUS',
        {
          session: 'test-session',
        }
      );

      expect(artifact.schema_version).toBe('1.0.0');
      expect(artifact.mode).toBe('checkpoint');
      expect(artifact.goal).toBe('Test goal');
      expect(artifact.now).toBe('Test now');
      expect(artifact.outcome).toBe('PARTIAL_PLUS');
      expect(artifact.session).toBe('test-session');
      expect(artifact.date).toMatch(/^\d{4}-\d{2}-\d{2}/);
    });

    it('should create valid handoff artifact with bead', () => {
      const artifact = createArtifact(
        'handoff',
        'Test goal',
        'Test now',
        'SUCCEEDED',
        {
          session: 'test-session',
          primary_bead: 'beads-123',
        }
      );

      expect(artifact.mode).toBe('handoff');
      expect((artifact as HandoffArtifact).primary_bead).toBe('beads-123');
    });

    it('should create valid finalize artifact with bead', () => {
      const artifact = createArtifact(
        'finalize',
        'Test goal',
        'Test now',
        'SUCCEEDED',
        {
          session: 'test-session',
          primary_bead: 'beads-456',
        }
      );

      expect(artifact.mode).toBe('finalize');
      expect((artifact as FinalizeArtifact).primary_bead).toBe('beads-456');
    });

    it('should throw error when handoff missing bead', () => {
      expect(() => {
        createArtifact('handoff', 'Test goal', 'Test now', 'SUCCEEDED', {
          session: 'test-session',
        });
      }).toThrow('Handoff artifacts require a primary_bead');
    });

    it('should throw error when finalize missing bead', () => {
      expect(() => {
        createArtifact('finalize', 'Test goal', 'Test now', 'SUCCEEDED', {
          session: 'test-session',
        });
      }).toThrow('Finalize artifacts require a primary_bead');
    });

    it('should accept custom date', () => {
      const customTime = '2026-01-13T10:00:00Z';
      const artifact = createArtifact('checkpoint', 'Goal', 'Now', 'SUCCEEDED', {
        session: 'test-session',
        date: customTime,
      });

      expect(artifact.date).toBe(customTime);
    });

    it('should accept metadata', () => {
      const artifact = createArtifact('checkpoint', 'Goal', 'Now', 'SUCCEEDED', {
        session: 'test-session',
        metadata: {
          custom_field: 'value',
          nested: { foo: 'bar' },
        },
      });

      expect(artifact.metadata).toEqual({
        custom_field: 'value',
        nested: { foo: 'bar' },
      });
    });
  });

  describe('validateArtifact', () => {
    it('should validate valid checkpoint artifact', () => {
      const artifact = createArtifact('checkpoint', 'Goal', 'Now', 'SUCCEEDED', { session: 'test-session' });
      expect(validateArtifact(artifact)).toBe(true);
    });

    it('should validate valid handoff artifact', () => {
      const artifact = createArtifact('handoff', 'Goal', 'Now', 'SUCCEEDED', {
        primary_bead: 'beads-123',
        session: 'test-session',
      });
      expect(validateArtifact(artifact)).toBe(true);
    });

    it('should validate valid finalize artifact', () => {
      const artifact = createArtifact('finalize', 'Goal', 'Now', 'SUCCEEDED', {
        primary_bead: 'beads-456',
        session: 'test-session',
      });
      expect(validateArtifact(artifact)).toBe(true);
    });

    it('should reject null', () => {
      expect(validateArtifact(null)).toBe(false);
    });

    it('should reject undefined', () => {
      expect(validateArtifact(undefined)).toBe(false);
    });

    it('should reject non-object', () => {
      expect(validateArtifact('string')).toBe(false);
      expect(validateArtifact(123)).toBe(false);
      expect(validateArtifact([])).toBe(false);
    });

    it('should reject missing schema_version', () => {
      const invalid = {
        mode: 'checkpoint',
        date: '2026-01-13T10:00:00Z',
        session: 'test-session',
        goal: 'Goal',
        now: 'Now',
        outcome: 'SUCCEEDED',
      };
      expect(validateArtifact(invalid)).toBe(false);
    });

    it('should reject missing mode', () => {
      const invalid = {
        schema_version: '1.0.0',
        date: '2026-01-13T10:00:00Z',
        session: 'test-session',
        goal: 'Goal',
        now: 'Now',
        outcome: 'SUCCEEDED',
      };
      expect(validateArtifact(invalid)).toBe(false);
    });

    it('should reject invalid mode', () => {
      const invalid = {
        schema_version: '1.0.0',
        mode: 'invalid',
        date: '2026-01-13T10:00:00Z',
        session: 'test-session',
        goal: 'Goal',
        now: 'Now',
        outcome: 'SUCCEEDED',
      };
      expect(validateArtifact(invalid)).toBe(false);
    });

    it('should reject missing date', () => {
      const invalid = {
        schema_version: '1.0.0',
        mode: 'checkpoint',
        session: 'test-session',
        goal: 'Goal',
        now: 'Now',
        outcome: 'SUCCEEDED',
      };
      expect(validateArtifact(invalid)).toBe(false);
    });

    it('should reject missing goal', () => {
      const invalid = {
        schema_version: '1.0.0',
        mode: 'checkpoint',
        date: '2026-01-13T10:00:00Z',
        session: 'test-session',
        now: 'Now',
        outcome: 'SUCCEEDED',
      };
      expect(validateArtifact(invalid)).toBe(false);
    });

    it('should reject missing now', () => {
      const invalid = {
        schema_version: '1.0.0',
        mode: 'checkpoint',
        date: '2026-01-13T10:00:00Z',
        session: 'test-session',
        goal: 'Goal',
        outcome: 'SUCCEEDED',
      };
      expect(validateArtifact(invalid)).toBe(false);
    });

    it('should reject missing outcome', () => {
      const invalid = {
        schema_version: '1.0.0',
        mode: 'checkpoint',
        date: '2026-01-13T10:00:00Z',
        session: 'test-session',
        goal: 'Goal',
        now: 'Now',
      };
      expect(validateArtifact(invalid)).toBe(false);
    });

    it('should reject invalid outcome', () => {
      const invalid = {
        schema_version: '1.0.0',
        mode: 'checkpoint',
        date: '2026-01-13T10:00:00Z',
        session: 'test-session',
        goal: 'Goal',
        now: 'Now',
        outcome: 'INVALID',
      };
      expect(validateArtifact(invalid)).toBe(false);
    });

    it('should reject handoff without primary_bead', () => {
      const invalid = {
        schema_version: '1.0.0',
        mode: 'handoff',
        date: '2026-01-13T10:00:00Z',
        session: 'test-session',
        goal: 'Goal',
        now: 'Now',
        outcome: 'SUCCEEDED',
      };
      expect(validateArtifact(invalid)).toBe(false);
    });

    it('should reject finalize without primary_bead', () => {
      const invalid = {
        schema_version: '1.0.0',
        mode: 'finalize',
        date: '2026-01-13T10:00:00Z',
        session: 'test-session',
        goal: 'Goal',
        now: 'Now',
        outcome: 'SUCCEEDED',
      };
      expect(validateArtifact(invalid)).toBe(false);
    });
  });

  describe('Type Guards', () => {
    it('should identify checkpoint artifacts', () => {
      const checkpoint = createArtifact('checkpoint', 'Goal', 'Now', 'SUCCEEDED', { session: 'test-session' });
      expect(isCheckpoint(checkpoint)).toBe(true);
      expect(isHandoff(checkpoint)).toBe(false);
      expect(isFinalize(checkpoint)).toBe(false);
    });

    it('should identify handoff artifacts', () => {
      const handoff = createArtifact('handoff', 'Goal', 'Now', 'SUCCEEDED', {
        primary_bead: 'beads-123',
        session: 'test-session',
      });
      expect(isCheckpoint(handoff)).toBe(false);
      expect(isHandoff(handoff)).toBe(true);
      expect(isFinalize(handoff)).toBe(false);
    });

    it('should identify finalize artifacts', () => {
      const finalize = createArtifact('finalize', 'Goal', 'Now', 'SUCCEEDED', {
        primary_bead: 'beads-456',
        session: 'test-session',
      });
      expect(isCheckpoint(finalize)).toBe(false);
      expect(isHandoff(finalize)).toBe(false);
      expect(isFinalize(finalize)).toBe(true);
    });
  });

  describe('requiresBead', () => {
    it('should return false for checkpoint', () => {
      expect(requiresBead('checkpoint')).toBe(false);
    });

    it('should return true for handoff', () => {
      expect(requiresBead('handoff')).toBe(true);
    });

    it('should return true for finalize', () => {
      expect(requiresBead('finalize')).toBe(true);
    });
  });

  describe('Complex Artifacts', () => {
    it('should support full checkpoint with all fields', () => {
      const checkpoint: CheckpointArtifact = {
        schema_version: '1.0.0',
        mode: 'checkpoint',
        date: '2026-01-13T10:00:00Z',
        session_id: 'sess-123',
        session: 'auth-refactor',
        goal: 'Implement user authentication',
        now: 'Writing JWT middleware',
        outcome: 'PARTIAL_PLUS',
        done_this_session: [
          { task: 'Created auth module', files: ['src/auth/index.ts'] },
        ],
        next: ['Add logout endpoint', 'Write integration tests'],
        blockers: ['Waiting on Redis setup'],
        questions: ['Should we support refresh tokens?'],
        decisions: {
          jwt_library: 'Chose jsonwebtoken for better docs',
        },
        worked: ['TDD approach caught edge cases'],
        failed: ['Token refresh too complex'],
        findings: {
          root_cause: 'Session storage needed',
        },
        git: {
          branch: 'feat/auth',
          commit: 'abc1234',
          remote: 'origin',
        },
        files: {
          created: ['src/auth/jwt.ts'],
          modified: ['src/index.ts'],
        },
        test: 'npm test',
        metadata: {
          custom: 'value',
        },
      };

      expect(validateArtifact(checkpoint)).toBe(true);
      expect(isCheckpoint(checkpoint)).toBe(true);
    });

    it('should support full handoff with mode-specific fields', () => {
      const handoff: HandoffArtifact = {
        schema_version: '1.0.0',
        mode: 'handoff',
        date: '2026-01-13T15:00:00Z',
        session: 'auth-refactor',
        goal: 'Implement user authentication',
        now: 'Complete logout endpoint',
        outcome: 'PARTIAL_PLUS',
        primary_bead: 'beads-123',
        related_beads: ['beads-120', 'beads-121'],
        files_to_review: [
          { path: 'src/auth/jwt.ts', note: 'New JWT middleware' },
          { path: 'tests/auth.test.ts', note: '15 new tests' },
        ],
        continuation_prompt: 'Continue with logout endpoint at POST /auth/logout',
        done_this_session: [
          { task: 'Implemented JWT middleware', files: ['src/auth/jwt.ts'] },
        ],
        next: ['Implement logout endpoint'],
      };

      expect(validateArtifact(handoff)).toBe(true);
      expect(isHandoff(handoff)).toBe(true);
      expect(handoff.primary_bead).toBe('beads-123');
    });

    it('should support full finalize with final solutions', () => {
      const finalize: FinalizeArtifact = {
        schema_version: '1.0.0',
        mode: 'finalize',
        date: '2026-01-13T18:00:00Z',
        session: 'auth-refactor',
        goal: 'Implement user authentication',
        now: 'Session complete - all endpoints tested',
        outcome: 'SUCCEEDED',
        primary_bead: 'beads-123',
        related_beads: ['beads-120', 'beads-121'],
        final_solutions: [
          {
            problem: 'JWT tokens too complex',
            solution: 'Switched to session-based auth with Redis',
            rationale: 'Simpler, no token refresh logic needed',
          },
        ],
        final_decisions: [
          {
            decision: 'Use Redis for session storage',
            alternatives_considered: ['PostgreSQL', 'in-memory'],
            why_this: '24h TTL matches our needs, horizontal scaling',
          },
        ],
        artifacts_produced: [
          { path: 'src/auth/session.ts', note: 'Session model' },
          { path: 'docs/auth-migration.md', note: 'Migration guide' },
        ],
      };

      expect(validateArtifact(finalize)).toBe(true);
      expect(isFinalize(finalize)).toBe(true);
      expect(finalize.final_solutions).toHaveLength(1);
    });
  });

  describe('SessionOutcome Values', () => {
    it('should accept all valid outcomes', () => {
      const outcomes = ['SUCCEEDED', 'PARTIAL_PLUS', 'PARTIAL_MINUS', 'FAILED'];

      outcomes.forEach((outcome) => {
        const artifact = createArtifact(
          'checkpoint',
          'Goal',
          'Now',
          outcome as any,
          { session: 'test-session' }
        );
        expect(validateArtifact(artifact)).toBe(true);
      });
    });
  });

  describe('Extensibility', () => {
    it('should preserve metadata through validation', () => {
      const artifact = createArtifact('checkpoint', 'Goal', 'Now', 'SUCCEEDED', {
        session: 'test-session',
        metadata: {
          custom_field: 'value',
          integration_data: { foo: 'bar' },
          experimental: true,
        },
      });

      expect(validateArtifact(artifact)).toBe(true);
      expect(artifact.metadata?.custom_field).toBe('value');
      expect(artifact.metadata?.integration_data).toEqual({ foo: 'bar' });
      expect(artifact.metadata?.experimental).toBe(true);
    });
  });
});
