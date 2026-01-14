#!/usr/bin/env node
/**
 * CLI tool to create finalize artifacts using the unified writeArtifact() system.
 *
 * Usage:
 *   node write-finalize-cli.js --goal "..." --now "..." --outcome SUCCEEDED --primary_bead beads-xxx [options]
 *
 * This script provides a bash-callable interface to the TypeScript writeArtifact() function
 * for the /finalize skill.
 */

import { writeArtifact } from './shared/artifact-writer.js';
import { createArtifact } from './shared/artifact-schema.js';
import type { FinalizeArtifact, SessionOutcome, CompletedTask } from './shared/artifact-schema.js';

// =============================================================================
// CLI Argument Parsing
// =============================================================================

interface CLIArgs {
  goal: string;
  now: string;
  outcome: SessionOutcome;
  primary_bead: string;
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
  final_solutions?: string; // JSON string
  final_decisions?: string; // JSON string
  artifacts_produced?: string; // JSON string
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

  // Validate required fields
  if (!parsed.goal || !parsed.now || !parsed.outcome || !parsed.primary_bead) {
    console.error('Error: Missing required arguments');
    console.error('Required: --goal, --now, --outcome, --primary_bead');
    console.error('');
    console.error('Usage:');
    console.error('  node write-finalize-cli.js \\');
    console.error('    --goal "Goal description" \\');
    console.error('    --now "Final status" \\');
    console.error('    --outcome SUCCEEDED \\');
    console.error('    --primary_bead beads-xxx \\');
    console.error('    [--session_id abc123] \\');
    console.error('    [--test "pytest tests/"] \\');
    console.error('    [--final_solutions \'[{"problem":"...","solution":"..."}]\'] \\');
    console.error('    [--final_decisions \'[{"decision":"...","rationale":"..."}]\']');
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
      'finalize',
      args.goal,
      args.now,
      args.outcome as SessionOutcome,
      {
        primary_bead: args.primary_bead,
        session_id: args.session_id,
        session_name: args.session_name,
      }
    ) as FinalizeArtifact;

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

    // Finalize-specific fields
    if (args.final_solutions) {
      artifact.final_solutions = JSON.parse(args.final_solutions);
    }
    if (args.final_decisions) {
      artifact.final_decisions = JSON.parse(args.final_decisions);
    }
    if (args.artifacts_produced) {
      artifact.artifacts_produced = JSON.parse(args.artifacts_produced);
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
