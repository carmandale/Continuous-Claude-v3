/**
 * Integration tests for /checkpoint, /handoff, and /finalize skills
 *
 * These tests verify end-to-end functionality:
 * 1. Skills can be invoked via their CLI wrappers
 * 2. Artifacts are created in the correct location
 * 3. Artifacts validate against the unified schema
 * 4. Content includes all expected fields
 * 5. Filenames follow the spec (YYYY-MM-DDTHH-MM-SS.sssZ_sessionid.md)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { readFile, access } from 'fs/promises';
import { spawn } from 'child_process';
import { ARTIFACT_DIR } from '../shared/artifact-writer.js';
import YAML from 'yaml';

// =============================================================================
// Test Utilities
// =============================================================================

interface SpawnResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

async function runCLI(scriptPath: string, args: string[]): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [scriptPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (exitCode) => {
      resolve({ stdout, stderr, exitCode: exitCode ?? 1 });
    });

    proc.on('error', (error) => {
      reject(error);
    });
  });
}

function parseArtifactYAML(content: string): any {
  // Remove frontmatter delimiters
  const yamlContent = content.replace(/^---\n/, '').split('\n---\n')[0];
  return YAML.parse(yamlContent);
}

// =============================================================================
// Test Setup
// =============================================================================

// Store original CWD at module level before any tests run
const MODULE_CWD = process.cwd();

describe('Skill Integration Tests', () => {
  let tempDir: string;

  beforeEach(() => {
    // Create temporary directory for each test
    tempDir = mkdtempSync(join(tmpdir(), 'skill-integration-test-'));

    // Change to temp directory so artifacts are written there
    process.chdir(tempDir);
  });

  afterEach(() => {
    // Restore original directory
    process.chdir(MODULE_CWD);

    // Clean up temporary directory
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ===========================================================================
  // /checkpoint Skill Integration Tests
  // ===========================================================================

  describe('/checkpoint skill', () => {
    const CLI_PATH = join(MODULE_CWD, 'dist/write-checkpoint-cli.mjs');

    it('should create checkpoint artifact with minimal fields', async () => {
      const result = await runCLI(CLI_PATH, [
        '--goal', 'Test checkpoint goal',
        '--now', 'Test checkpoint now',
        '--outcome', 'PARTIAL_PLUS',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.path).toBeTruthy();

      // Verify file exists
      await expect(access(output.path)).resolves.toBeUndefined();

      // Verify content
      const content = await readFile(output.path, 'utf-8');
      const parsed = parseArtifactYAML(content);

      expect(parsed.schema_version).toBe('1.0.0');
      expect(parsed.event_type).toBe('checkpoint');
      expect(parsed.goal).toBe('Test checkpoint goal');
      expect(parsed.now).toBe('Test checkpoint now');
      expect(parsed.outcome).toBe('PARTIAL_PLUS');
      expect(parsed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    });

    it('should create checkpoint artifact with bead ID', async () => {
      const result = await runCLI(CLI_PATH, [
        '--goal', 'Test with bead',
        '--now', 'Testing bead support',
        '--outcome', 'SUCCEEDED',
        '--primary_bead', 'test-bead-123',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      const content = await readFile(output.path, 'utf-8');
      const parsed = parseArtifactYAML(content);

      expect(parsed.primary_bead).toBe('test-bead-123');
    });

    it('should create checkpoint with next steps and blockers', async () => {
      const result = await runCLI(CLI_PATH, [
        '--goal', 'Progress checkpoint',
        '--now', 'Mid-task',
        '--outcome', 'PARTIAL_PLUS',
        '--next', 'Step 1',
        '--next', 'Step 2',
        '--blockers', 'Blocker 1',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      const content = await readFile(output.path, 'utf-8');
      const parsed = parseArtifactYAML(content);

      expect(parsed.next).toEqual(['Step 1', 'Step 2']);
      expect(parsed.blockers).toEqual(['Blocker 1']);
    });

    it('should write checkpoint to correct directory', async () => {
      const result = await runCLI(CLI_PATH, [
        '--goal', 'Location test',
        '--now', 'Testing location',
        '--outcome', 'SUCCEEDED',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      // Verify path contains the artifact directory
      expect(output.path).toContain(ARTIFACT_DIR);
      expect(output.path).toMatch(/\/thoughts\/shared\/handoffs\/events\//);
    });

    it('should generate filename in correct format', async () => {
      const result = await runCLI(CLI_PATH, [
        '--goal', 'Filename test',
        '--now', 'Testing filename',
        '--outcome', 'SUCCEEDED',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      // Extract filename from path
      const filename = output.path.split('/').pop();

      // Verify format: YYYY-MM-DDTHH-MM-SS.sssZ_sessionid.md
      expect(filename).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.\d{3}Z_[0-9a-f]{8}\.md$/);
    });
  });

  // ===========================================================================
  // /handoff Skill Integration Tests
  // ===========================================================================

  describe('/handoff skill', () => {
    const CLI_PATH = join(MODULE_CWD, 'dist/write-handoff-cli.mjs');

    it('should create handoff artifact with required fields', async () => {
      const result = await runCLI(CLI_PATH, [
        '--goal', 'Test handoff goal',
        '--now', 'Next session should continue',
        '--outcome', 'PARTIAL_PLUS',
        '--primary_bead', 'beads-handoff-123',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.path).toBeTruthy();

      // Verify file exists
      await expect(access(output.path)).resolves.toBeUndefined();

      // Verify content
      const content = await readFile(output.path, 'utf-8');
      const parsed = parseArtifactYAML(content);

      expect(parsed.schema_version).toBe('1.0.0');
      expect(parsed.event_type).toBe('handoff');
      expect(parsed.goal).toBe('Test handoff goal');
      expect(parsed.now).toBe('Next session should continue');
      expect(parsed.outcome).toBe('PARTIAL_PLUS');
      expect(parsed.primary_bead).toBe('beads-handoff-123');
    });

    it('should fail without primary_bead', async () => {
      const result = await runCLI(CLI_PATH, [
        '--goal', 'Test without bead',
        '--now', 'Should fail',
        '--outcome', 'PARTIAL_PLUS',
      ]);

      expect(result.exitCode).toBe(1);
      // Check that error message contains 'required' (either in stderr or stdout)
      const errorOutput = result.stderr || result.stdout;
      expect(errorOutput).toContain('required');
    });

    it('should create handoff with files_to_review', async () => {
      const filesToReview = JSON.stringify([
        { path: 'src/test.ts', note: 'Main implementation' },
        { path: 'tests/test.test.ts' },
      ]);

      const result = await runCLI(CLI_PATH, [
        '--goal', 'Handoff with files',
        '--now', 'Review these files',
        '--outcome', 'PARTIAL_PLUS',
        '--primary_bead', 'beads-456',
        '--files_to_review', filesToReview,
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      const content = await readFile(output.path, 'utf-8');
      const parsed = parseArtifactYAML(content);

      expect(parsed.files_to_review).toHaveLength(2);
      expect(parsed.files_to_review[0].path).toBe('src/test.ts');
      expect(parsed.files_to_review[0].note).toBe('Main implementation');
    });

    it('should create handoff with continuation_prompt', async () => {
      const result = await runCLI(CLI_PATH, [
        '--goal', 'Handoff with prompt',
        '--now', 'Next session instructions',
        '--outcome', 'PARTIAL_PLUS',
        '--primary_bead', 'beads-789',
        '--continuation_prompt', 'Start by running tests',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      const content = await readFile(output.path, 'utf-8');
      const parsed = parseArtifactYAML(content);

      expect(parsed.continuation_prompt).toBe('Start by running tests');
    });

    it('should write handoff to correct directory', async () => {
      const result = await runCLI(CLI_PATH, [
        '--goal', 'Location test',
        '--now', 'Testing location',
        '--outcome', 'PARTIAL_PLUS',
        '--primary_bead', 'beads-loc-123',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      // Verify path contains the artifact directory
      expect(output.path).toContain(ARTIFACT_DIR);
      expect(output.path).toMatch(/\/thoughts\/shared\/handoffs\/events\//);
    });
  });

  // ===========================================================================
  // /finalize Skill Integration Tests
  // ===========================================================================

  describe('/finalize skill', () => {
    const CLI_PATH = join(MODULE_CWD, 'dist/write-finalize-cli.mjs');

    it('should create finalize artifact with required fields', async () => {
      const result = await runCLI(CLI_PATH, [
        '--goal', 'Test finalize goal',
        '--now', 'Work is complete',
        '--outcome', 'SUCCEEDED',
        '--primary_bead', 'beads-finalize-123',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);
      expect(output.success).toBe(true);
      expect(output.path).toBeTruthy();

      // Verify file exists
      await expect(access(output.path)).resolves.toBeUndefined();

      // Verify content
      const content = await readFile(output.path, 'utf-8');
      const parsed = parseArtifactYAML(content);

      expect(parsed.schema_version).toBe('1.0.0');
      expect(parsed.event_type).toBe('finalize');
      expect(parsed.goal).toBe('Test finalize goal');
      expect(parsed.now).toBe('Work is complete');
      expect(parsed.outcome).toBe('SUCCEEDED');
      expect(parsed.primary_bead).toBe('beads-finalize-123');
    });

    it('should fail without primary_bead', async () => {
      const result = await runCLI(CLI_PATH, [
        '--goal', 'Test without bead',
        '--now', 'Should fail',
        '--outcome', 'SUCCEEDED',
      ]);

      expect(result.exitCode).toBe(1);
      // Check that error message contains 'required' (either in stderr or stdout)
      const errorOutput = result.stderr || result.stdout;
      expect(errorOutput).toContain('required');
    });

    it('should create finalize with final_solutions', async () => {
      const solutions = JSON.stringify([
        {
          problem: 'Auth complexity',
          solution: 'Simplified with sessions',
          rationale: 'Easier to maintain',
        },
      ]);

      const result = await runCLI(CLI_PATH, [
        '--goal', 'Finalize with solutions',
        '--now', 'Complete',
        '--outcome', 'SUCCEEDED',
        '--primary_bead', 'beads-sol-123',
        '--final_solutions', solutions,
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      const content = await readFile(output.path, 'utf-8');
      const parsed = parseArtifactYAML(content);

      expect(parsed.final_solutions).toHaveLength(1);
      expect(parsed.final_solutions[0].problem).toBe('Auth complexity');
      expect(parsed.final_solutions[0].solution).toBe('Simplified with sessions');
    });

    it('should create finalize with final_decisions', async () => {
      const decisions = JSON.stringify([
        {
          decision: 'Use Redis for caching',
          rationale: 'Fast and reliable',
          alternatives_considered: ['In-memory', 'PostgreSQL'],
          why_this: 'Better scaling properties',
        },
      ]);

      const result = await runCLI(CLI_PATH, [
        '--goal', 'Finalize with decisions',
        '--now', 'Complete',
        '--outcome', 'SUCCEEDED',
        '--primary_bead', 'beads-dec-123',
        '--final_decisions', decisions,
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      const content = await readFile(output.path, 'utf-8');
      const parsed = parseArtifactYAML(content);

      expect(parsed.final_decisions).toHaveLength(1);
      expect(parsed.final_decisions[0].decision).toBe('Use Redis for caching');
      expect(parsed.final_decisions[0].alternatives_considered).toEqual(['In-memory', 'PostgreSQL']);
    });

    it('should create finalize with artifacts_produced', async () => {
      const artifacts = JSON.stringify([
        { path: 'src/new-feature.ts', note: 'Main implementation' },
        { path: 'docs/feature.md', note: 'Documentation' },
      ]);

      const result = await runCLI(CLI_PATH, [
        '--goal', 'Finalize with artifacts',
        '--now', 'Complete',
        '--outcome', 'SUCCEEDED',
        '--primary_bead', 'beads-art-123',
        '--artifacts_produced', artifacts,
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      const content = await readFile(output.path, 'utf-8');
      const parsed = parseArtifactYAML(content);

      expect(parsed.artifacts_produced).toHaveLength(2);
      expect(parsed.artifacts_produced[0].path).toBe('src/new-feature.ts');
    });

    it('should write finalize to correct directory', async () => {
      const result = await runCLI(CLI_PATH, [
        '--goal', 'Location test',
        '--now', 'Complete',
        '--outcome', 'SUCCEEDED',
        '--primary_bead', 'beads-loc-456',
      ]);

      expect(result.exitCode).toBe(0);
      const output = JSON.parse(result.stdout);

      // Verify path contains the artifact directory
      expect(output.path).toContain(ARTIFACT_DIR);
      expect(output.path).toMatch(/\/thoughts\/shared\/handoffs\/events\//);
    });
  });

  // ===========================================================================
  // Cross-Skill Validation Tests
  // ===========================================================================

  describe('cross-skill validation', () => {
    it('should create all three types with same session_id', async () => {
      const sessionId = 'test1234';

      const checkpointResult = await runCLI(
        join(MODULE_CWD, 'dist/write-checkpoint-cli.mjs'),
        [
          '--goal', 'Checkpoint',
          '--now', 'Working',
          '--outcome', 'PARTIAL_PLUS',
          '--session_id', sessionId,
        ]
      );

      const handoffResult = await runCLI(
        join(MODULE_CWD, 'dist/write-handoff-cli.mjs'),
        [
          '--goal', 'Handoff',
          '--now', 'Transferring',
          '--outcome', 'PARTIAL_PLUS',
          '--primary_bead', 'beads-123',
          '--session_id', sessionId,
        ]
      );

      const finalizeResult = await runCLI(
        join(MODULE_CWD, 'dist/write-finalize-cli.mjs'),
        [
          '--goal', 'Finalize',
          '--now', 'Complete',
          '--outcome', 'SUCCEEDED',
          '--primary_bead', 'beads-456',
          '--session_id', sessionId,
        ]
      );

      expect(checkpointResult.exitCode).toBe(0);
      expect(handoffResult.exitCode).toBe(0);
      expect(finalizeResult.exitCode).toBe(0);

      // Verify all have same session ID
      const checkpointOutput = JSON.parse(checkpointResult.stdout);
      const handoffOutput = JSON.parse(handoffResult.stdout);
      const finalizeOutput = JSON.parse(finalizeResult.stdout);

      expect(checkpointOutput.artifact.session_id).toBe(sessionId);
      expect(handoffOutput.artifact.session_id).toBe(sessionId);
      expect(finalizeOutput.artifact.session_id).toBe(sessionId);
    });

    it('should validate that all artifacts use same schema version', async () => {
      const checkpointResult = await runCLI(
        join(MODULE_CWD, 'dist/write-checkpoint-cli.mjs'),
        ['--goal', 'Test', '--now', 'Test', '--outcome', 'SUCCEEDED']
      );

      const handoffResult = await runCLI(
        join(MODULE_CWD, 'dist/write-handoff-cli.mjs'),
        ['--goal', 'Test', '--now', 'Test', '--outcome', 'SUCCEEDED', '--primary_bead', 'beads-1']
      );

      const finalizeResult = await runCLI(
        join(MODULE_CWD, 'dist/write-finalize-cli.mjs'),
        ['--goal', 'Test', '--now', 'Test', '--outcome', 'SUCCEEDED', '--primary_bead', 'beads-2']
      );

      const checkpointContent = await readFile(JSON.parse(checkpointResult.stdout).path, 'utf-8');
      const handoffContent = await readFile(JSON.parse(handoffResult.stdout).path, 'utf-8');
      const finalizeContent = await readFile(JSON.parse(finalizeResult.stdout).path, 'utf-8');

      const checkpointParsed = parseArtifactYAML(checkpointContent);
      const handoffParsed = parseArtifactYAML(handoffContent);
      const finalizeParsed = parseArtifactYAML(finalizeContent);

      expect(checkpointParsed.schema_version).toBe('1.0.0');
      expect(handoffParsed.schema_version).toBe('1.0.0');
      expect(finalizeParsed.schema_version).toBe('1.0.0');
    });
  });
});
