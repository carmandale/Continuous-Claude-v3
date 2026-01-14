/**
 * Unified artifact writer for checkpoint, handoff, and finalize events.
 *
 * Writes YAML frontmatter + YAML body to session folders:
 * thoughts/shared/handoffs/{session}/YYYY-MM-DD_HH-MM_<title>_<mode>.yaml
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
 * Canonical directory for all artifacts (session subfolders within)
 */
export const ARTIFACT_DIR = 'thoughts/shared/handoffs';

const FRONTMATTER_KEYS = new Set([
  'schema_version',
  'mode',
  'date',
  'session',
  'outcome',
  'primary_bead',
  'session_id',
  'root_span_id',
  'turn_span_id',
]);

// =============================================================================
// Filename Generation
// =============================================================================

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'session';
}

function formatDateForFilename(dateValue: string): string {
  // Accept date or date-time. Default time to 00-00 if missing.
  const match = dateValue.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (match) {
    const [, date, hour, minute] = match;
    const hh = hour || '00';
    const mm = minute || '00';
    return `${date}_${hh}-${mm}`;
  }

  // Fallback to current UTC time
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const min = String(now.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}_${hh}-${min}`;
}

function getTitleSlug(artifact: UnifiedArtifact): string {
  const session = artifact.session || 'session';
  const bead = artifact.primary_bead;

  if (bead && session.startsWith(`${bead}-`)) {
    return slugify(session.slice(bead.length + 1));
  }

  return slugify(session);
}

/**
 * Generate filename for artifact
 *
 * Format: YYYY-MM-DD_HH-MM_<title>_<mode>.yaml
 */
export function generateFilename(artifact: UnifiedArtifact): string {
  const datePart = formatDateForFilename(artifact.date);
  const titleSlug = getTitleSlug(artifact);
  return `${datePart}_${titleSlug}_${artifact.mode}.yaml`;
}

// =============================================================================
// YAML Formatting
// =============================================================================

/**
 * Convert artifact to YAML frontmatter + YAML body
 */
export function formatArtifactYaml(artifact: UnifiedArtifact): string {
  const frontmatter: Record<string, unknown> = {};
  const body: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(artifact)) {
    if (value === undefined) continue;
    if (FRONTMATTER_KEYS.has(key)) {
      frontmatter[key] = value;
    } else {
      body[key] = value;
    }
  }

  const front = YAML.stringify(frontmatter, {
    lineWidth: 0,
    defaultStringType: 'PLAIN',
    defaultKeyType: 'PLAIN',
  }).trimEnd();

  const bodyYaml = YAML.stringify(body, {
    lineWidth: 0,
    defaultStringType: 'PLAIN',
    defaultKeyType: 'PLAIN',
  }).trimEnd();

  if (bodyYaml) {
    return `---\n${front}\n---\n\n${bodyYaml}\n`;
  }

  return `---\n${front}\n---\n`;
}

// =============================================================================
// Path Resolution
// =============================================================================

function getSessionDir(artifact: UnifiedArtifact, baseDir: string): string {
  return join(baseDir, ARTIFACT_DIR, artifact.session);
}

/**
 * Resolve absolute path for artifact file
 */
export function resolveArtifactPath(artifact: UnifiedArtifact, baseDir: string = process.cwd()): string {
  const filename = generateFilename(artifact);
  return join(getSessionDir(artifact, baseDir), filename);
}

/**
 * Ensure artifact directory exists
 */
export async function ensureArtifactDir(artifact: UnifiedArtifact, baseDir: string = process.cwd()): Promise<void> {
  const dirPath = getSessionDir(artifact, baseDir);

  if (!existsSync(dirPath)) {
    await mkdir(dirPath, { recursive: true });
  }
}

// =============================================================================
// Writer Functions
// =============================================================================

/**
 * Write artifact to disk
 */
export async function writeArtifact(
  artifact: UnifiedArtifact,
  options?: {
    baseDir?: string;
    dryRun?: boolean;
  }
): Promise<string> {
  assertValidArtifact(artifact);

  const content = formatArtifactYaml(artifact);
  const baseDir = options?.baseDir || process.cwd();
  const filePath = resolveArtifactPath(artifact, baseDir);

  if (options?.dryRun) {
    return filePath;
  }

  await ensureArtifactDir(artifact, baseDir);

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
 */
export async function writeArtifactWithContent(
  artifact: UnifiedArtifact,
  options?: {
    baseDir?: string;
    dryRun?: boolean;
  }
): Promise<{ path: string; content: string }> {
  assertValidArtifact(artifact);

  const content = formatArtifactYaml(artifact);
  const baseDir = options?.baseDir || process.cwd();
  const filePath = resolveArtifactPath(artifact, baseDir);

  if (options?.dryRun) {
    return { path: filePath, content };
  }

  await ensureArtifactDir(artifact, baseDir);

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

export function artifactExists(artifact: UnifiedArtifact, baseDir: string = process.cwd()): boolean {
  const filePath = resolveArtifactPath(artifact, baseDir);
  return existsSync(filePath);
}

export function getArtifactPath(artifact: UnifiedArtifact, baseDir: string = process.cwd()): string {
  return resolveArtifactPath(artifact, baseDir);
}
