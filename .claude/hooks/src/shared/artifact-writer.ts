/**
 * Unified artifact writer for checkpoint, handoff, and finalize events.
 *
 * Provides functions to write validated artifacts to disk in the correct
 * location with proper filename formatting.
 *
 * Design principles:
 * - Write to canonical location: thoughts/shared/handoffs/events/
 * - Use consistent filename format: YYYY-MM-DDTHH-MM-SS.sssZ_sessionid.md
 * - Validate before writing
 * - Provide clear error messages on failure
 *
 * Related:
 * - Schema: artifact-schema.ts, artifact-schema.json
 * - Validation: artifact-validator.ts
 * - Plan: thoughts/shared/plans/2026-01-13-unified-artifact-system.md
 */

import { writeFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import YAML from 'yaml';
import type { UnifiedArtifact } from './artifact-schema.js';
import { assertValidArtifact } from './artifact-validator.js';

// =============================================================================
// Constants
// =============================================================================

/**
 * Canonical directory for all artifacts
 */
export const ARTIFACT_DIR = 'thoughts/shared/handoffs/events';

// =============================================================================
// Filename Generation
// =============================================================================

/**
 * Generate filename for artifact
 *
 * Format: YYYY-MM-DDTHH-MM-SS.sssZ_sessionid.md
 *
 * @param timestamp - ISO 8601 timestamp
 * @param sessionId - Session identifier
 * @returns Filename
 *
 * @example
 * generateFilename('2026-01-14T00:54:26.972Z', '77ef540c')
 * // => '2026-01-14T00-54-26.972Z_77ef540c.md'
 */
export function generateFilename(timestamp: string, sessionId?: string): string {
  // Convert ISO timestamp to filename-safe format
  // 2026-01-14T00:54:26.972Z => 2026-01-14T00-54-26.972Z
  const fileTimestamp = timestamp
    .replace(/:/g, '-')  // Replace colons with hyphens
    .replace(/\.\d{3}Z$/, (ms) => ms);  // Keep milliseconds

  // Generate session ID if not provided
  const id = sessionId || generateSessionId();

  return `${fileTimestamp}_${id}.md`;
}

/**
 * Generate a random 8-character session ID
 *
 * @returns Session ID in format: [0-9a-f]{8}
 */
function generateSessionId(): string {
  return Math.random().toString(16).slice(2, 10).padEnd(8, '0');
}

// =============================================================================
// YAML Formatting
// =============================================================================

/**
 * Convert artifact to YAML string with frontmatter
 *
 * @param artifact - Validated artifact
 * @returns Markdown content with YAML frontmatter
 *
 * @example
 * const yaml = formatArtifactYaml(artifact);
 * // ---
 * // schema_version: "1.0.0"
 * // event_type: checkpoint
 * // ...
 * // ---
 */
export function formatArtifactYaml(artifact: UnifiedArtifact): string {
  const yamlContent = YAML.stringify(artifact, {
    lineWidth: 0,  // Don't wrap long lines
    defaultStringType: 'PLAIN',  // Don't quote simple strings
    defaultKeyType: 'PLAIN',  // Plain keys (no quotes)
  });

  return `---\n${yamlContent}---\n`;
}

// =============================================================================
// Path Resolution
// =============================================================================

/**
 * Resolve absolute path for artifact file
 *
 * @param filename - Artifact filename
 * @param baseDir - Base directory (defaults to process.cwd())
 * @returns Absolute path to artifact file
 */
export function resolveArtifactPath(filename: string, baseDir: string = process.cwd()): string {
  return join(baseDir, ARTIFACT_DIR, filename);
}

/**
 * Ensure artifact directory exists
 *
 * @param baseDir - Base directory (defaults to process.cwd())
 * @throws Error if directory creation fails
 */
export async function ensureArtifactDir(baseDir: string = process.cwd()): Promise<void> {
  const dirPath = join(baseDir, ARTIFACT_DIR);

  if (!existsSync(dirPath)) {
    await mkdir(dirPath, { recursive: true });
  }
}

// =============================================================================
// Writer Functions
// =============================================================================

/**
 * Write artifact to disk
 *
 * This is the main entry point for writing artifacts. It:
 * 1. Validates the artifact against the JSON Schema
 * 2. Generates the filename from timestamp and session_id
 * 3. Formats the artifact as YAML with frontmatter
 * 4. Ensures the target directory exists
 * 5. Writes the file to disk
 *
 * @param artifact - Artifact to write (must pass validation)
 * @param options - Write options
 * @returns Path to written file
 * @throws Error if validation fails or write fails
 *
 * @example
 * const artifact = createArtifact('checkpoint', 'Fix auth bug', 'Debugging', 'PARTIAL_PLUS');
 * const path = await writeArtifact(artifact);
 * console.log(`Artifact written to: ${path}`);
 */
export async function writeArtifact(
  artifact: UnifiedArtifact,
  options?: {
    baseDir?: string;
    dryRun?: boolean;
  }
): Promise<string> {
  // Step 1: Validate artifact
  assertValidArtifact(artifact);

  // Step 2: Generate filename
  const filename = generateFilename(artifact.timestamp, artifact.session_id);

  // Step 3: Format as YAML
  const content = formatArtifactYaml(artifact);

  // Step 4: Resolve path
  const baseDir = options?.baseDir || process.cwd();
  const filePath = resolveArtifactPath(filename, baseDir);

  // Step 5: Dry run check
  if (options?.dryRun) {
    return filePath;
  }

  // Step 6: Ensure directory exists
  await ensureArtifactDir(baseDir);

  // Step 7: Write file
  try {
    await writeFile(filePath, content, 'utf-8');
    return filePath;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to write artifact to ${filePath}: ${message}`);
  }
}

/**
 * Write artifact and return both path and content
 *
 * Useful for testing or when you need to verify what was written.
 *
 * @param artifact - Artifact to write
 * @param options - Write options
 * @returns Object with path and content
 */
export async function writeArtifactWithContent(
  artifact: UnifiedArtifact,
  options?: {
    baseDir?: string;
    dryRun?: boolean;
  }
): Promise<{ path: string; content: string }> {
  assertValidArtifact(artifact);

  const filename = generateFilename(artifact.timestamp, artifact.session_id);
  const content = formatArtifactYaml(artifact);
  const baseDir = options?.baseDir || process.cwd();
  const filePath = resolveArtifactPath(filename, baseDir);

  if (options?.dryRun) {
    return { path: filePath, content };
  }

  await ensureArtifactDir(baseDir);

  try {
    await writeFile(filePath, content, 'utf-8');
    return { path: filePath, content };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to write artifact to ${filePath}: ${message}`);
  }
}

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Check if artifact file already exists
 *
 * @param artifact - Artifact to check
 * @param baseDir - Base directory (defaults to process.cwd())
 * @returns True if file exists
 */
export function artifactExists(artifact: UnifiedArtifact, baseDir: string = process.cwd()): boolean {
  const filename = generateFilename(artifact.timestamp, artifact.session_id);
  const filePath = resolveArtifactPath(filename, baseDir);
  return existsSync(filePath);
}

/**
 * Get the file path that would be used for an artifact (without writing)
 *
 * @param artifact - Artifact to get path for
 * @param baseDir - Base directory (defaults to process.cwd())
 * @returns Full path where artifact would be written
 */
export function getArtifactPath(artifact: UnifiedArtifact, baseDir: string = process.cwd()): string {
  const filename = generateFilename(artifact.timestamp, artifact.session_id);
  return resolveArtifactPath(filename, baseDir);
}
