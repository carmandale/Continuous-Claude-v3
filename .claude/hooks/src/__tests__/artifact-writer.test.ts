/**
 * Tests for artifact-writer.ts
 *
 * Verifies that:
 * - writeArtifact() writes to correct location
 * - Filename format matches spec (YYYY-MM-DDTHH-MM-SS.sssZ_sessionid.md)
 * - YAML frontmatter is correctly formatted
 * - All three event types (checkpoint, handoff, finalize) work
 * - Validation is enforced before writing
 * - Error handling works for file write failures
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readFile, access } from 'fs/promises';
import {
  writeArtifact,
  writeArtifactWithContent,
  generateFilename,
  formatArtifactYaml,
  resolveArtifactPath,
  ensureArtifactDir,
  artifactExists,
  getArtifactPath,
  ARTIFACT_DIR,
} from '../shared/artifact-writer.js';
import { createArtifact } from '../shared/artifact-schema.js';
import type { UnifiedArtifact, CheckpointArtifact, HandoffArtifact, FinalizeArtifact } from '../shared/artifact-schema.js';
import YAML from 'yaml';

// =============================================================================
// Test Fixtures
// =============================================================================

const TEST_TIMESTAMP = '2026-01-14T00:54:26.972Z';
const TEST_SESSION_ID = '77ef540c';

function createTestCheckpoint(): CheckpointArtifact {
  return createArtifact('checkpoint', 'Test goal', 'Test now', 'SUCCEEDED', {
    timestamp: TEST_TIMESTAMP,
    session_id: TEST_SESSION_ID,
  }) as CheckpointArtifact;
}

function createTestHandoff(): HandoffArtifact {
  return createArtifact('handoff', 'Test goal', 'Test now', 'PARTIAL_PLUS', {
    timestamp: TEST_TIMESTAMP,
    session_id: TEST_SESSION_ID,
    primary_bead: 'test-bead-123',
  }) as HandoffArtifact;
}

function createTestFinalize(): FinalizeArtifact {
  return createArtifact('finalize', 'Test goal', 'Test now', 'SUCCEEDED', {
    timestamp: TEST_TIMESTAMP,
    session_id: TEST_SESSION_ID,
    primary_bead: 'test-bead-456',
  }) as FinalizeArtifact;
}

// =============================================================================
// Test Setup
// =============================================================================

describe('artifact-writer', () => {
  let tempDir: string;

  beforeEach(() => {
    // Create temporary directory for each test
    tempDir = mkdtempSync(join(tmpdir(), 'artifact-writer-test-'));
  });

  afterEach(() => {
    // Clean up temporary directory
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ===========================================================================
  // Filename Generation Tests
  // ===========================================================================

  describe('generateFilename', () => {
    it('should generate correct filename format', () => {
      const filename = generateFilename(TEST_TIMESTAMP, TEST_SESSION_ID);
      expect(filename).toBe('2026-01-14T00-54-26.972Z_77ef540c.md');
    });

    it('should replace colons with hyphens in timestamp', () => {
      const filename = generateFilename('2026-01-14T12:34:56.789Z', 'abc12345');
      expect(filename).toBe('2026-01-14T12-34-56.789Z_abc12345.md');
    });

    it('should generate session ID if not provided', () => {
      const filename = generateFilename(TEST_TIMESTAMP);
      expect(filename).toMatch(/^2026-01-14T00-54-26\.972Z_[0-9a-f]{8}\.md$/);
    });

    it('should preserve milliseconds in timestamp', () => {
      const filename = generateFilename('2026-01-14T00:00:00.123Z', 'test1234');
      expect(filename).toContain('.123Z');
    });
  });

  // ===========================================================================
  // YAML Formatting Tests
  // ===========================================================================

  describe('formatArtifactYaml', () => {
    it('should format checkpoint artifact as YAML with frontmatter', () => {
      const artifact = createTestCheckpoint();
      const yaml = formatArtifactYaml(artifact);

      expect(yaml).toContain('---\n');
      expect(yaml).toContain('schema_version: 1.0.0');
      expect(yaml).toContain('event_type: checkpoint');
      expect(yaml).toContain('goal: Test goal');
      expect(yaml).toContain('now: Test now');
      expect(yaml).toContain('outcome: SUCCEEDED');
    });

    it('should format handoff artifact with bead fields', () => {
      const artifact = createTestHandoff();
      const yaml = formatArtifactYaml(artifact);

      expect(yaml).toContain('event_type: handoff');
      expect(yaml).toContain('primary_bead: test-bead-123');
    });

    it('should format finalize artifact with bead fields', () => {
      const artifact = createTestFinalize();
      const yaml = formatArtifactYaml(artifact);

      expect(yaml).toContain('event_type: finalize');
      expect(yaml).toContain('primary_bead: test-bead-456');
    });

    it('should include optional fields when present', () => {
      const artifact = createTestCheckpoint();
      artifact.next = ['Next task 1', 'Next task 2'];
      artifact.blockers = ['Blocker 1'];

      const yaml = formatArtifactYaml(artifact);

      expect(yaml).toContain('next:');
      expect(yaml).toContain('- Next task 1');
      expect(yaml).toContain('blockers:');
      expect(yaml).toContain('- Blocker 1');
    });

    it('should be parseable back to object', () => {
      const artifact = createTestCheckpoint();
      const yaml = formatArtifactYaml(artifact);

      // Remove frontmatter delimiters
      const yamlContent = yaml.replace(/^---\n/, '').replace(/\n---\n$/, '');
      const parsed = YAML.parse(yamlContent);

      expect(parsed.schema_version).toBe(artifact.schema_version);
      expect(parsed.event_type).toBe(artifact.event_type);
      expect(parsed.goal).toBe(artifact.goal);
    });
  });

  // ===========================================================================
  // Path Resolution Tests
  // ===========================================================================

  describe('resolveArtifactPath', () => {
    it('should resolve path relative to base directory', () => {
      const path = resolveArtifactPath('test.md', tempDir);
      expect(path).toBe(join(tempDir, ARTIFACT_DIR, 'test.md'));
    });

    it('should use process.cwd() by default', () => {
      const path = resolveArtifactPath('test.md');
      expect(path).toBe(join(process.cwd(), ARTIFACT_DIR, 'test.md'));
    });
  });

  describe('ensureArtifactDir', () => {
    it('should create directory if it does not exist', async () => {
      const dirPath = join(tempDir, ARTIFACT_DIR);

      // Verify directory doesn't exist yet
      await expect(access(dirPath)).rejects.toThrow();

      // Create directory
      await ensureArtifactDir(tempDir);

      // Verify directory now exists
      await expect(access(dirPath)).resolves.toBeUndefined();
    });

    it('should not error if directory already exists', async () => {
      await ensureArtifactDir(tempDir);
      await expect(ensureArtifactDir(tempDir)).resolves.toBeUndefined();
    });
  });

  // ===========================================================================
  // Write Tests
  // ===========================================================================

  describe('writeArtifact', () => {
    it('should write checkpoint artifact to correct location', async () => {
      const artifact = createTestCheckpoint();
      const path = await writeArtifact(artifact, { baseDir: tempDir });

      const expectedPath = join(tempDir, ARTIFACT_DIR, '2026-01-14T00-54-26.972Z_77ef540c.md');
      expect(path).toBe(expectedPath);

      // Verify file exists
      const content = await readFile(path, 'utf-8');
      expect(content).toContain('---\n');
      expect(content).toContain('event_type: checkpoint');
    });

    it('should write handoff artifact with primary_bead', async () => {
      const artifact = createTestHandoff();
      const path = await writeArtifact(artifact, { baseDir: tempDir });

      const content = await readFile(path, 'utf-8');
      expect(content).toContain('event_type: handoff');
      expect(content).toContain('primary_bead: test-bead-123');
    });

    it('should write finalize artifact with primary_bead', async () => {
      const artifact = createTestFinalize();
      const path = await writeArtifact(artifact, { baseDir: tempDir });

      const content = await readFile(path, 'utf-8');
      expect(content).toContain('event_type: finalize');
      expect(content).toContain('primary_bead: test-bead-456');
    });

    it('should validate artifact before writing', async () => {
      const invalidArtifact = { invalid: 'data' } as unknown as UnifiedArtifact;

      await expect(
        writeArtifact(invalidArtifact, { baseDir: tempDir })
      ).rejects.toThrow(/validation failed/i);
    });

    it('should create directory if it does not exist', async () => {
      const artifact = createTestCheckpoint();
      const path = await writeArtifact(artifact, { baseDir: tempDir });

      // Verify file was written despite directory not existing initially
      const content = await readFile(path, 'utf-8');
      expect(content).toBeTruthy();
    });

    it('should support dry run mode', async () => {
      const artifact = createTestCheckpoint();
      const path = await writeArtifact(artifact, { baseDir: tempDir, dryRun: true });

      const expectedPath = join(tempDir, ARTIFACT_DIR, '2026-01-14T00-54-26.972Z_77ef540c.md');
      expect(path).toBe(expectedPath);

      // Verify file was NOT written
      await expect(access(path)).rejects.toThrow();
    });

    it('should throw error if write fails', async () => {
      const artifact = createTestCheckpoint();

      // Use invalid base directory to trigger write failure
      await expect(
        writeArtifact(artifact, { baseDir: '/invalid/path/that/does/not/exist' })
      ).rejects.toThrow();  // Just check that it throws, don't match specific message
    });
  });

  describe('writeArtifactWithContent', () => {
    it('should return both path and content', async () => {
      const artifact = createTestCheckpoint();
      const result = await writeArtifactWithContent(artifact, { baseDir: tempDir });

      expect(result.path).toBeTruthy();
      expect(result.content).toBeTruthy();
      expect(result.content).toContain('---\n');
      expect(result.content).toContain('event_type: checkpoint');

      // Verify file was written with same content
      const fileContent = await readFile(result.path, 'utf-8');
      expect(fileContent).toBe(result.content);
    });

    it('should support dry run mode', async () => {
      const artifact = createTestCheckpoint();
      const result = await writeArtifactWithContent(artifact, { baseDir: tempDir, dryRun: true });

      expect(result.path).toBeTruthy();
      expect(result.content).toBeTruthy();

      // Verify file was NOT written
      await expect(access(result.path)).rejects.toThrow();
    });
  });

  // ===========================================================================
  // Convenience Functions Tests
  // ===========================================================================

  describe('artifactExists', () => {
    it('should return false if artifact does not exist', () => {
      const artifact = createTestCheckpoint();
      expect(artifactExists(artifact, tempDir)).toBe(false);
    });

    it('should return true if artifact exists', async () => {
      const artifact = createTestCheckpoint();
      await writeArtifact(artifact, { baseDir: tempDir });

      expect(artifactExists(artifact, tempDir)).toBe(true);
    });
  });

  describe('getArtifactPath', () => {
    it('should return correct path without writing', () => {
      const artifact = createTestCheckpoint();
      const path = getArtifactPath(artifact, tempDir);

      const expectedPath = join(tempDir, ARTIFACT_DIR, '2026-01-14T00-54-26.972Z_77ef540c.md');
      expect(path).toBe(expectedPath);

      // Verify file does NOT exist
      expect(artifactExists(artifact, tempDir)).toBe(false);
    });
  });

  // ===========================================================================
  // Integration Tests
  // ===========================================================================

  describe('integration', () => {
    it('should write and read back checkpoint artifact', async () => {
      const artifact = createTestCheckpoint();
      artifact.next = ['Task 1', 'Task 2'];
      artifact.learnings = {
        worked: ['Pattern 1'],
        failed: ['Pattern 2'],
      };

      const path = await writeArtifact(artifact, { baseDir: tempDir });
      const content = await readFile(path, 'utf-8');

      // Parse YAML
      const yamlContent = content.replace(/^---\n/, '').replace(/\n---\n$/, '');
      const parsed = YAML.parse(yamlContent);

      expect(parsed.event_type).toBe('checkpoint');
      expect(parsed.goal).toBe('Test goal');
      expect(parsed.next).toEqual(['Task 1', 'Task 2']);
      expect(parsed.learnings.worked).toEqual(['Pattern 1']);
    });

    it('should write handoff with all fields', async () => {
      const artifact = createTestHandoff();
      artifact.files_to_review = [
        { path: 'src/test.ts', note: 'Main file' },
        { path: 'tests/test.test.ts' },
      ];
      artifact.continuation_prompt = 'Continue with implementation';

      const path = await writeArtifact(artifact, { baseDir: tempDir });
      const content = await readFile(path, 'utf-8');

      expect(content).toContain('files_to_review:');
      expect(content).toContain('path: src/test.ts');
      expect(content).toContain('note: Main file');
      expect(content).toContain('continuation_prompt:');
    });

    it('should write finalize with solutions and decisions', async () => {
      const artifact = createTestFinalize();
      artifact.final_solutions = [
        {
          problem: 'Auth complexity',
          solution: 'Use sessions',
          rationale: 'Simpler',
        },
      ];
      artifact.final_decisions = [
        {
          decision: 'Use Redis',
          rationale: 'Fast',
          alternatives_considered: ['PostgreSQL', 'In-memory'],
          why_this: 'Better scaling',
        },
      ];

      const path = await writeArtifact(artifact, { baseDir: tempDir });
      const content = await readFile(path, 'utf-8');

      expect(content).toContain('final_solutions:');
      expect(content).toContain('problem: Auth complexity');
      expect(content).toContain('final_decisions:');
      expect(content).toContain('decision: Use Redis');
    });
  });
});
