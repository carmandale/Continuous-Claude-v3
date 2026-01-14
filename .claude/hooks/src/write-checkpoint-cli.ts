#!/usr/bin/env node
/**
 * CLI tool to create checkpoint artifacts using the unified writeArtifact() system.
 *
 * Usage:
 *   node write-checkpoint-cli.js --goal "..." --now "..." --outcome PARTIAL_PLUS [options]
 *
 * This script provides a bash-callable interface to the TypeScript writeArtifact() function
 * for the /checkpoint skill.
 *
 * Key difference from handoff: primary_bead is OPTIONAL (checkpoints don't require beads)
 */

import { writeArtifact } from './shared/artifact-writer.js';
import { createArtifact } from './shared/artifact-schema.js';
import type { CheckpointArtifact, SessionOutcome, CompletedTask } from './shared/artifact-schema.js';

// =============================================================================
// CLI Argument Parsing
// =============================================================================

interface CLIArgs {
  goal: string;
  now: string;
  outcome: SessionOutcome;
  primary_bead?: string;  // Optional for checkpoint
  session_id?: string;
  session_name?: string;
  test?: string;
  next?: string[];
  blockers?: string[];
  questions?: string[];
  this_session?: string;  // JSON string of CompletedTask[]
  decisions?: string;      // JSON string
  findings?: string;       // JSON string
  learnings?: string;      // JSON string
  git?: string;            // JSON string
  files?: string;          // JSON string
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  const parsed: Partial<CLIArgs> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const value = args[i + 1];

    if (arg.startsWith('--')) {
      const key = arg.slice(2);

      // Array arguments
      if (key === 'next' || key === 'blockers' || key === 'questions') {
        if (!parsed[key]) {
          parsed[key] = [];
        }
        (parsed[key] as string[]).push(value);
        i++;
        continue;
      }

      // Single value arguments
      if (value !== undefined) {
        (parsed as any)[key] = value;
        i++;
      }
    }
  }

  // Validate required fields (primary_bead is NOT required for checkpoint)
  if (!parsed.goal || !parsed.now || !parsed.outcome) {
    console.error('Error: Missing required arguments');
    console.error('Required: --goal, --now, --outcome');
    console.error('');
    console.error('Usage:');
    console.error('  node write-checkpoint-cli.js \\');
    console.error('    --goal "Goal description" \\');
    console.error('    --now "Current focus" \\');
    console.error('    --outcome PARTIAL_PLUS \\');
    console.error('    [--primary_bead beads-xxx] \\');
    console.error('    [--session_id abc123] \\');
    console.error('    [--test "pytest tests/"] \\');
    console.error('    [--next "First step"] \\');
    console.error('    [--blockers "Blocker 1"]');
    process.exit(1);
  }

  return parsed as CLIArgs;
}

// =============================================================================
// Main
// =============================================================================

async function main() {
  try {
    const args = parseArgs();

    // Create base artifact
    const artifact = createArtifact(
      'checkpoint',
      args.goal,
      args.now,
      args.outcome as SessionOutcome,
      {
        primary_bead: args.primary_bead,  // Optional for checkpoint
        session_id: args.session_id,
        session_name: args.session_name,
      }
    ) as CheckpointArtifact;

    // Add optional fields
    if (args.test) artifact.test = args.test;
    if (args.next) artifact.next = args.next;
    if (args.blockers) artifact.blockers = args.blockers;
    if (args.questions) artifact.questions = args.questions;

    // Parse JSON fields
    if (args.this_session) {
      artifact.this_session = JSON.parse(args.this_session) as CompletedTask[];
    }
    if (args.decisions) {
      artifact.decisions = JSON.parse(args.decisions);
    }
    if (args.findings) {
      artifact.findings = JSON.parse(args.findings);
    }
    if (args.learnings) {
      artifact.learnings = JSON.parse(args.learnings);
    }
    if (args.git) {
      artifact.git = JSON.parse(args.git);
    }
    if (args.files) {
      artifact.files = JSON.parse(args.files);
    }

    // Write artifact
    const filePath = await writeArtifact(artifact);

    // Output success
    console.log(JSON.stringify({
      success: true,
      path: filePath,
      artifact: {
        event_type: artifact.event_type,
        timestamp: artifact.timestamp,
        session_id: artifact.session_id,
        primary_bead: artifact.primary_bead,
      }
    }, null, 2));

  } catch (error) {
    console.error(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, null, 2));
    process.exit(1);
  }
}

main();
