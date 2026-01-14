#!/usr/bin/env node
/**
 * CLI tool to create handoff artifacts using the unified writeArtifact() system.
 *
 * Usage:
 *   node write-handoff-cli.js --goal "..." --now "..." --outcome SUCCEEDED --primary_bead beads-xxx [options]
 */

import { writeArtifact } from './shared/artifact-writer.js';
import { createArtifact } from './shared/artifact-schema.js';
import type { HandoffArtifact, SessionOutcome, CompletedTask } from './shared/artifact-schema.js';

// =============================================================================
// Helpers
// =============================================================================

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'session';
}

function normalizeSessionName(value: string): string {
  return value.trim().replace(/\s+/g, '-');
}

function buildSessionName(args: CLIArgs): string {
  if (args.session) {
    return normalizeSessionName(args.session);
  }

  if (args.primary_bead) {
    const titleSource = args.session_title || args.goal;
    return `${args.primary_bead}-${slugify(titleSource)}`;
  }

  if (args.session_title) {
    return slugify(args.session_title);
  }

  throw new Error('session name is required when no primary_bead is provided');
}

// =============================================================================
// CLI Argument Parsing
// =============================================================================

interface CLIArgs {
  goal: string;
  now: string;
  outcome: SessionOutcome;
  primary_bead: string;
  session?: string;
  session_title?: string;
  session_id?: string;
  test?: string;
  next?: string[];
  blockers?: string[];
  questions?: string[];
  done_this_session?: string; // JSON string of CompletedTask[]
  decisions?: string;         // JSON string
  findings?: string;          // JSON string
  worked?: string[];
  failed?: string[];
  learnings?: string;         // JSON string (compat)
  git?: string;               // JSON string
  files?: string;             // JSON string
  related_beads?: string[];
  files_to_review?: string;   // JSON string
  continuation_prompt?: string;
}

function parseArgs(): CLIArgs {
  const args = process.argv.slice(2);
  const parsed: Partial<CLIArgs> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const value = args[i + 1];

    if (arg.startsWith('--')) {
      let key = arg.slice(2);

      if (key === 'bead') {
        key = 'primary_bead';
      }

      if (key === 'session_name' || key === 'session-name') {
        key = 'session';
      }

      if (key === 'session_title' || key === 'session-title') {
        key = 'session_title';
      }

      if (key === 'done_this_session' || key === 'done-this-session') {
        key = 'done_this_session';
      }

      // Array arguments
      if (key === 'next' || key === 'blockers' || key === 'questions' || key === 'related_beads' || key === 'worked' || key === 'failed') {
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
    console.error('  node write-handoff-cli.js \\');
    console.error('    --goal "Goal description" \\');
    console.error('    --now "Next steps" \\');
    console.error('    --outcome SUCCEEDED \\');
    console.error('    --primary_bead beads-xxx \\');
    console.error('    [--session "bead-short-title"] \\');
    console.error('    [--session-title "short title"] \\');
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
    const session = buildSessionName(args);

    // Create base artifact
    const artifact = createArtifact(
      'handoff',
      args.goal,
      args.now,
      args.outcome as SessionOutcome,
      {
        primary_bead: args.primary_bead,
        session,
        session_id: args.session_id,
      }
    ) as HandoffArtifact;

    // Add optional fields
    if (args.test) artifact.test = args.test;
    if (args.next) artifact.next = args.next;
    if (args.blockers) artifact.blockers = args.blockers;
    if (args.questions) artifact.questions = args.questions;
    if (args.related_beads) artifact.related_beads = args.related_beads;
    if (args.continuation_prompt) artifact.continuation_prompt = args.continuation_prompt;
    if (args.worked) artifact.worked = args.worked;
    if (args.failed) artifact.failed = args.failed;

    // Parse JSON fields
    if (args.done_this_session) {
      artifact.done_this_session = JSON.parse(args.done_this_session) as CompletedTask[];
    }
    if (args.decisions) {
      artifact.decisions = JSON.parse(args.decisions);
    }
    if (args.findings) {
      artifact.findings = JSON.parse(args.findings);
    }
    if (args.learnings) {
      const learnings = JSON.parse(args.learnings) as { worked?: string[]; failed?: string[] };
      if (learnings.worked) artifact.worked = learnings.worked;
      if (learnings.failed) artifact.failed = learnings.failed;
    }
    if (args.git) {
      artifact.git = JSON.parse(args.git);
    }
    if (args.files) {
      artifact.files = JSON.parse(args.files);
    }
    if (args.files_to_review) {
      artifact.files_to_review = JSON.parse(args.files_to_review);
    }

    // Write artifact
    const filePath = await writeArtifact(artifact);

    // Output success
    console.log(JSON.stringify({
      success: true,
      path: filePath,
      artifact: {
        mode: artifact.mode,
        date: artifact.date,
        session: artifact.session,
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
