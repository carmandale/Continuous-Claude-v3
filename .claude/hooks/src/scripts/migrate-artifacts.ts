#!/usr/bin/env node
/**
 * Migration script to convert old checkpoint and handoff artifacts to unified format.
 *
 * This script:
 * 1. Scans .checkpoint/ and .handoff/ directories
 * 2. Parses old markdown format
 * 3. Converts to unified artifact schema
 * 4. Writes to thoughts/shared/handoffs/events/
 * 5. Validates converted artifacts
 *
 * Usage:
 *   npm run migrate-artifacts          # Migrate all artifacts
 *   npm run migrate-artifacts --dry-run  # Preview without writing
 *
 * Related:
 * - Plan: thoughts/shared/plans/2026-01-13-unified-artifact-system.md
 * - Schema: artifact-schema.ts
 * - Writer: artifact-writer.ts
 */

import { readdir, readFile } from 'fs/promises';
import { join, basename } from 'path';
import { existsSync } from 'fs';
import YAML from 'yaml';
import type { UnifiedArtifact, CheckpointArtifact, HandoffArtifact } from '../shared/artifact-schema.js';
import { ARTIFACT_SCHEMA_VERSION } from '../shared/artifact-schema.js';
import { writeArtifact } from '../shared/artifact-writer.js';
import { assertValidArtifact } from '../shared/artifact-validator.js';

// =============================================================================
// Types
// =============================================================================

interface MigrationStats {
  checkpointsProcessed: number;
  checkpointsSkipped: number;
  checkpointsFailed: number;
  handoffsProcessed: number;
  handoffsSkipped: number;
  handoffsFailed: number;
}

interface OldCheckpointData {
  date: string;
  activeBead?: string;
  goal: string;
  accomplished: string[];
  remaining: string[];
  decisions?: Record<string, string>;
  patterns?: string[];
  filesChanged?: Record<string, string>;
  blockers?: string[];
  resumePrompt?: string;
}

interface OldHandoffData {
  date: string;
  primaryBead?: string;
  agent?: string;
  completed: string[];
  inProgress?: string[];
  relatedBeads?: Record<string, string>;
  decisions?: Record<string, string>;
  nextUp?: string[];
  filesModified?: string[];
  continuationPrompt?: string;
}

// =============================================================================
// Parsing Functions
// =============================================================================

/**
 * Parse old checkpoint markdown format
 */
function parseOldCheckpoint(content: string, filename: string): OldCheckpointData {
  const lines = content.split('\n');
  const data: Partial<OldCheckpointData> = {
    accomplished: [],
    remaining: [],
  };

  let section = '';
  const sectionContent: string[] = [];

  for (const line of lines) {
    // Extract date from "**Date:** 2026-01-10 08:15"
    if (line.startsWith('**Date:**')) {
      data.date = line.replace('**Date:**', '').trim();
    }

    // Extract active bead
    if (line.startsWith('**Active Bead:**')) {
      const bead = line.replace('**Active Bead:**', '').trim();
      if (bead && bead !== 'None') {
        data.activeBead = bead;
      }
    }

    // Extract goal
    if (line.startsWith('**Goal:**')) {
      data.goal = line.replace('**Goal:**', '').trim();
    }

    // Track sections
    if (line.startsWith('## ')) {
      // Process previous section
      if (section && sectionContent.length > 0) {
        processCheckpointSection(section, sectionContent, data);
      }
      section = line.replace('## ', '').trim();
      sectionContent.length = 0;
    } else if (section) {
      sectionContent.push(line);
    }
  }

  // Process final section
  if (section && sectionContent.length > 0) {
    processCheckpointSection(section, sectionContent, data);
  }

  // Extract timestamp from filename if date parsing fails
  if (!data.date) {
    // Filename format: 2026-01-10-0815.md
    const match = filename.match(/(\d{4}-\d{2}-\d{2})-(\d{4})/);
    if (match) {
      const [, date, time] = match;
      const hour = time.slice(0, 2);
      const minute = time.slice(2, 4);
      data.date = `${date} ${hour}:${minute}`;
    }
  }

  return data as OldCheckpointData;
}

/**
 * Process a section from old checkpoint format
 */
function processCheckpointSection(section: string, content: string[], data: Partial<OldCheckpointData>): void {
  const text = content.join('\n').trim();

  switch (section) {
    case 'Accomplished':
      data.accomplished = extractListItems(text);
      break;

    case 'Remaining':
      data.remaining = extractListItems(text);
      break;

    case 'Key Decisions':
      data.decisions = extractTable(text);
      break;

    case 'Patterns Discovered':
      data.patterns = extractListItems(text);
      break;

    case 'Files Changed':
      data.filesChanged = extractTable(text);
      break;

    case 'Blockers / Open Questions':
      data.blockers = extractListItems(text);
      break;

    case 'Resume Prompt':
      data.resumePrompt = text;
      break;
  }
}

/**
 * Parse old handoff markdown format
 */
function parseOldHandoff(content: string, filename: string): OldHandoffData {
  const lines = content.split('\n');
  const data: Partial<OldHandoffData> = {
    completed: [],
  };

  let section = '';
  const sectionContent: string[] = [];

  for (const line of lines) {
    // Extract date
    if (line.startsWith('**Date:**')) {
      data.date = line.replace('**Date:**', '').trim();
    }

    // Extract primary bead
    if (line.startsWith('**Primary Bead:**')) {
      const bead = line.replace('**Primary Bead:**', '').trim();
      if (bead && bead !== 'None') {
        data.primaryBead = bead;
      }
    }

    // Extract agent
    if (line.startsWith('**Agent:**')) {
      data.agent = line.replace('**Agent:**', '').trim();
    }

    // Track sections
    if (line.startsWith('## ')) {
      // Process previous section
      if (section && sectionContent.length > 0) {
        processHandoffSection(section, sectionContent, data);
      }
      section = line.replace('## ', '').trim();
      sectionContent.length = 0;
    } else if (section) {
      sectionContent.push(line);
    }
  }

  // Process final section
  if (section && sectionContent.length > 0) {
    processHandoffSection(section, sectionContent, data);
  }

  // Extract timestamp from filename if date parsing fails
  if (!data.date) {
    // Filename format: 2026-01-11-1005-Continuous-Claude-v3-d6v.md
    const match = filename.match(/(\d{4}-\d{2}-\d{2})-(\d{4})/);
    if (match) {
      const [, date, time] = match;
      const hour = time.slice(0, 2);
      const minute = time.slice(2, 4);
      data.date = `${date} ${hour}:${minute}`;
    }
  }

  return data as OldHandoffData;
}

/**
 * Process a section from old handoff format
 */
function processHandoffSection(section: string, content: string[], data: Partial<OldHandoffData>): void {
  const text = content.join('\n').trim();

  switch (section) {
    case 'Completed This Session':
      data.completed = extractListItems(text);
      break;

    case 'In Progress':
      data.inProgress = extractListItems(text);
      break;

    case 'Related Beads':
      data.relatedBeads = extractTable(text);
      break;

    case 'Key Decisions Made':
      data.decisions = extractTable(text);
      break;

    case 'Next Up':
      data.nextUp = extractListItems(text);
      break;

    case 'Files Modified':
      data.filesModified = extractListItems(text);
      break;

    case 'Continuation Prompt':
      data.continuationPrompt = text;
      break;
  }
}

// =============================================================================
// Parsing Helpers
// =============================================================================

/**
 * Extract list items from markdown (handles - [x] and - [ ] formats)
 */
function extractListItems(text: string): string[] {
  const items: string[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('-')) {
      // Remove checkbox markers
      const item = trimmed
        .replace(/^-\s*\[x\]\s*/i, '')
        .replace(/^-\s*\[\s*\]\s*/i, '')
        .replace(/^-\s+/, '')
        .trim();
      if (item) {
        items.push(item);
      }
    }
  }

  return items;
}

/**
 * Extract table data (markdown table format)
 */
function extractTable(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = text.split('\n');

  for (const line of lines) {
    if (line.includes('|') && !line.includes('---')) {
      const parts = line.split('|').map(p => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const [key, value] = parts;
        if (key && value) {
          result[key] = value;
        }
      }
    }
  }

  return result;
}

/**
 * Convert old date format to ISO 8601
 */
function convertToISO(dateStr: string): string {
  // Handle "2026-01-10 08:15" format
  const match = dateStr.match(/(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2})/);
  if (match) {
    const [, date, hour, minute] = match;
    return `${date}T${hour.padStart(2, '0')}:${minute}:00.000Z`;
  }

  // Fallback to current time if parsing fails
  return new Date().toISOString();
}

/**
 * Generate session ID from filename or random
 */
function generateSessionId(filename: string): string {
  // Try to extract from filename
  const match = filename.match(/_([0-9a-f]{8})/);
  if (match) {
    return match[1];
  }

  // Generate from hash of filename
  let hash = 0;
  for (let i = 0; i < filename.length; i++) {
    hash = ((hash << 5) - hash) + filename.charCodeAt(i);
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0').slice(0, 8);
}

// =============================================================================
// Conversion Functions
// =============================================================================

/**
 * Convert old checkpoint to unified format
 */
function convertCheckpoint(oldData: OldCheckpointData, filename: string): CheckpointArtifact {
  const timestamp = convertToISO(oldData.date);
  const sessionId = generateSessionId(filename);

  const artifact: CheckpointArtifact = {
    schema_version: ARTIFACT_SCHEMA_VERSION,
    event_type: 'checkpoint',
    timestamp,
    session_id: sessionId,
    primary_bead: oldData.activeBead,
    goal: oldData.goal || 'Session work',
    now: oldData.accomplished.length > 0 ? oldData.accomplished.join('; ') : 'In progress',
    outcome: determineOutcome(oldData.accomplished, oldData.remaining, oldData.blockers),
    this_session: oldData.accomplished.map(task => ({ task, files: [] })),
    next: oldData.remaining,
    blockers: oldData.blockers,
    decisions: oldData.decisions,
    learnings: oldData.patterns ? { worked: oldData.patterns } : undefined,
    metadata: {
      migrated_from: filename,
      migration_timestamp: new Date().toISOString(),
      original_format: 'checkpoint',
    },
  };

  return artifact;
}

/**
 * Convert old handoff to unified format
 */
function convertHandoff(oldData: OldHandoffData, filename: string): HandoffArtifact {
  const timestamp = convertToISO(oldData.date);
  const sessionId = generateSessionId(filename);

  // Extract related bead IDs
  const relatedBeads = oldData.relatedBeads
    ? Object.keys(oldData.relatedBeads)
    : undefined;

  const artifact: HandoffArtifact = {
    schema_version: ARTIFACT_SCHEMA_VERSION,
    event_type: 'handoff',
    timestamp,
    session_id: sessionId,
    session_name: oldData.agent,
    primary_bead: oldData.primaryBead || 'unknown',
    related_beads: relatedBeads,
    goal: oldData.primaryBead || 'Session work',
    now: oldData.completed.length > 0 ? oldData.completed.join('; ') : 'Work in progress',
    outcome: determineOutcome(oldData.completed, oldData.nextUp || [], []),
    this_session: oldData.completed.map(task => ({ task, files: [] })),
    next: oldData.nextUp,
    decisions: oldData.decisions,
    continuation_prompt: oldData.continuationPrompt,
    metadata: {
      migrated_from: filename,
      migration_timestamp: new Date().toISOString(),
      original_format: 'handoff',
    },
  };

  return artifact;
}

/**
 * Determine outcome based on progress
 */
function determineOutcome(
  accomplished: string[],
  remaining: string[],
  blockers?: string[]
): 'SUCCEEDED' | 'PARTIAL_PLUS' | 'PARTIAL_MINUS' | 'FAILED' {
  const totalTasks = accomplished.length + remaining.length;
  const completedRatio = totalTasks > 0 ? accomplished.length / totalTasks : 0;

  if (blockers && blockers.length > 2) {
    return 'PARTIAL_MINUS';
  }

  if (completedRatio >= 0.9) {
    return 'SUCCEEDED';
  } else if (completedRatio >= 0.5) {
    return 'PARTIAL_PLUS';
  } else if (completedRatio > 0) {
    return 'PARTIAL_MINUS';
  } else {
    return 'FAILED';
  }
}

// =============================================================================
// Migration Functions
// =============================================================================

/**
 * Migrate checkpoints from .checkpoint/ directory
 */
async function migrateCheckpoints(baseDir: string, dryRun: boolean): Promise<{
  processed: number;
  skipped: number;
  failed: number;
}> {
  const checkpointDir = join(baseDir, '.checkpoint');

  if (!existsSync(checkpointDir)) {
    console.log('No .checkpoint directory found');
    return { processed: 0, skipped: 0, failed: 0 };
  }

  const files = await readdir(checkpointDir);
  const mdFiles = files.filter(f => f.endsWith('.md'));

  console.log(`\nFound ${mdFiles.length} checkpoint files`);

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of mdFiles) {
    const filePath = join(checkpointDir, file);
    console.log(`\nProcessing checkpoint: ${file}`);

    try {
      const content = await readFile(filePath, 'utf-8');
      const oldData = parseOldCheckpoint(content, file);

      if (!oldData.date || !oldData.goal) {
        console.log(`  ⚠️  Skipping - missing required fields`);
        skipped++;
        continue;
      }

      const artifact = convertCheckpoint(oldData, file);

      // Validate
      assertValidArtifact(artifact);

      if (dryRun) {
        console.log(`  ✓ Would migrate to: ${artifact.timestamp}_${artifact.session_id}.md`);
        console.log(`    Goal: ${artifact.goal.slice(0, 50)}...`);
        console.log(`    Tasks: ${artifact.this_session?.length || 0}`);
      } else {
        const writtenPath = await writeArtifact(artifact, { baseDir });
        console.log(`  ✓ Migrated to: ${basename(writtenPath)}`);
      }

      processed++;
    } catch (error) {
      console.error(`  ✗ Failed: ${error instanceof Error ? error.message : String(error)}`);
      failed++;
    }
  }

  return { processed, skipped, failed };
}

/**
 * Migrate handoffs from .handoff/ directory
 */
async function migrateHandoffs(baseDir: string, dryRun: boolean): Promise<{
  processed: number;
  skipped: number;
  failed: number;
}> {
  const handoffDir = join(baseDir, '.handoff');

  if (!existsSync(handoffDir)) {
    console.log('No .handoff directory found');
    return { processed: 0, skipped: 0, failed: 0 };
  }

  const files = await readdir(handoffDir);
  const mdFiles = files.filter(f => f.endsWith('.md'));

  console.log(`\nFound ${mdFiles.length} handoff files`);

  let processed = 0;
  let skipped = 0;
  let failed = 0;

  for (const file of mdFiles) {
    const filePath = join(handoffDir, file);
    console.log(`\nProcessing handoff: ${file}`);

    try {
      const content = await readFile(filePath, 'utf-8');
      const oldData = parseOldHandoff(content, file);

      if (!oldData.date) {
        console.log(`  ⚠️  Skipping - missing required fields`);
        skipped++;
        continue;
      }

      const artifact = convertHandoff(oldData, file);

      // Validate
      assertValidArtifact(artifact);

      if (dryRun) {
        console.log(`  ✓ Would migrate to: ${artifact.timestamp}_${artifact.session_id}.md`);
        console.log(`    Bead: ${artifact.primary_bead}`);
        console.log(`    Tasks: ${artifact.this_session?.length || 0}`);
      } else {
        const writtenPath = await writeArtifact(artifact, { baseDir });
        console.log(`  ✓ Migrated to: ${basename(writtenPath)}`);
      }

      processed++;
    } catch (error) {
      console.error(`  ✗ Failed: ${error instanceof Error ? error.message : String(error)}`);
      failed++;
    }
  }

  return { processed, skipped, failed };
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');

  // Allow specifying base directory or default to project root (2 levels up from .claude/hooks)
  let baseDir = process.cwd();
  const baseDirArg = args.find(arg => arg.startsWith('--base-dir='));
  if (baseDirArg) {
    baseDir = baseDirArg.split('=')[1];
  } else if (baseDir.endsWith('.claude/hooks')) {
    // Running from hooks directory - go up to project root
    baseDir = join(baseDir, '../..');
  }

  console.log('='.repeat(80));
  console.log('Artifact Migration Script');
  console.log('='.repeat(80));

  if (dryRun) {
    console.log('\n🔍 DRY RUN MODE - No files will be written');
  }

  console.log(`\nBase directory: ${baseDir}`);

  // Migrate checkpoints
  const checkpointStats = await migrateCheckpoints(baseDir, dryRun);

  // Migrate handoffs
  const handoffStats = await migrateHandoffs(baseDir, dryRun);

  // Print summary
  console.log('\n' + '='.repeat(80));
  console.log('Migration Summary');
  console.log('='.repeat(80));

  console.log('\nCheckpoints:');
  console.log(`  ✓ Processed: ${checkpointStats.processed}`);
  console.log(`  ⚠️  Skipped:   ${checkpointStats.skipped}`);
  console.log(`  ✗ Failed:    ${checkpointStats.failed}`);

  console.log('\nHandoffs:');
  console.log(`  ✓ Processed: ${handoffStats.processed}`);
  console.log(`  ⚠️  Skipped:   ${handoffStats.skipped}`);
  console.log(`  ✗ Failed:    ${handoffStats.failed}`);

  const totalProcessed = checkpointStats.processed + handoffStats.processed;
  const totalFailed = checkpointStats.failed + handoffStats.failed;

  console.log('\nTotal:');
  console.log(`  ✓ Processed: ${totalProcessed}`);
  console.log(`  ✗ Failed:    ${totalFailed}`);

  if (dryRun && totalProcessed > 0) {
    console.log('\n💡 Run without --dry-run to perform actual migration');
  }

  console.log('\n' + '='.repeat(80));

  // Exit with error code if any failed
  process.exit(totalFailed > 0 ? 1 : 0);
}

// Run main
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
