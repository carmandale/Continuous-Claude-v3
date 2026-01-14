/**
 * Unified Artifact Schema for Checkpoint, Handoff, and Finalize events.
 *
 * Format: YAML frontmatter + YAML body.
 * - Frontmatter: session metadata (mode, date, session, outcome, bead)
 * - Body: goal/now and detailed context (all YAML)
 *
 * Related:
 * - Plan: thoughts/shared/plans/2026-01-13-unified-artifact-system.md
 * - Examples: thoughts/shared/handoffs/
 */

// =============================================================================
// Core Types
// =============================================================================

/**
 * Artifact modes - three entry points to the same core function
 */
export type ArtifactMode = 'checkpoint' | 'handoff' | 'finalize';

/**
 * Session outcome classification
 */
export type SessionOutcome =
  | 'SUCCEEDED'      // Goal achieved completely
  | 'PARTIAL_PLUS'   // Most goals achieved, minimal blockers
  | 'PARTIAL_MINUS'  // Some progress, significant blockers remain
  | 'FAILED';        // No meaningful progress

/**
 * Schema version for artifact format evolution
 */
export const ARTIFACT_SCHEMA_VERSION = '1.0.0';

// =============================================================================
// Common Fields (All Modes)
// =============================================================================

/**
 * File reference with contextual note
 */
export interface FileReference {
  path: string;
  note?: string;
}

/**
 * Task completion entry
 */
export interface CompletedTask {
  task: string;
  files: string[];
}

/**
 * Decision record with rationale
 */
export interface Decision {
  decision: string;
  rationale?: string;
  alternatives_considered?: string[];
  why_this?: string;
}

/**
 * Git metadata
 */
export interface GitMetadata {
  branch: string;
  commit: string;
  remote?: string;
  pr_ready?: string;
}

/**
 * Files modified in session
 */
export interface FilesModified {
  created?: string[];
  modified?: string[];
  deleted?: string[];
}

// =============================================================================
// Mode-Specific Fields
// =============================================================================

/**
 * Handoff-specific fields for session transfer
 */
export interface HandoffFields {
  related_beads?: string[];
  files_to_review?: FileReference[];
  continuation_prompt?: string;
}

/**
 * Finalize-specific fields for session closure
 */
export interface FinalizeFields {
  related_beads?: string[];
  final_solutions?: {
    problem: string;
    solution: string;
    rationale: string;
  }[];
  final_decisions?: Decision[];
  artifacts_produced?: FileReference[];
}

// =============================================================================
// Unified Artifact Structure
// =============================================================================

/**
 * Base artifact structure shared by all modes
 */
export interface BaseArtifact {
  // Frontmatter metadata
  schema_version: string;
  mode: ArtifactMode;
  date: string;      // ISO 8601 date or date-time
  session: string;   // Session folder name (bead + slug)
  outcome: SessionOutcome;
  primary_bead?: string;
  session_id?: string;
  agent_id?: string;
  root_span_id?: string;
  turn_span_id?: string;

  // Core content (YAML body)
  goal: string;
  now: string;

  // Progress tracking
  done_this_session?: CompletedTask[];
  next?: string[];
  blockers?: string[];
  questions?: string[];

  // Knowledge capture
  decisions?: Record<string, string> | Decision[];
  findings?: Record<string, string>;
  worked?: string[];
  failed?: string[];

  // Git context
  git?: GitMetadata;

  // Files
  files?: FilesModified;

  // Test verification
  test?: string;

  // Extensibility
  metadata?: Record<string, unknown>;
}

/**
 * Checkpoint artifact - lightweight snapshot
 */
export interface CheckpointArtifact extends BaseArtifact {
  mode: 'checkpoint';
}

/**
 * Handoff artifact - transfer package
 */
export interface HandoffArtifact extends BaseArtifact, HandoffFields {
  mode: 'handoff';
  primary_bead: string;
}

/**
 * Finalize artifact - session memorial
 */
export interface FinalizeArtifact extends BaseArtifact, FinalizeFields {
  mode: 'finalize';
  primary_bead: string;
}

/**
 * Union type for all artifact variants
 */
export type UnifiedArtifact = CheckpointArtifact | HandoffArtifact | FinalizeArtifact;

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Check if artifact is a checkpoint
 */
export function isCheckpoint(artifact: UnifiedArtifact): artifact is CheckpointArtifact {
  return artifact.mode === 'checkpoint';
}

/**
 * Check if artifact is a handoff
 */
export function isHandoff(artifact: UnifiedArtifact): artifact is HandoffArtifact {
  return artifact.mode === 'handoff';
}

/**
 * Check if artifact is a finalize
 */
export function isFinalize(artifact: UnifiedArtifact): artifact is FinalizeArtifact {
  return artifact.mode === 'finalize';
}

/**
 * Check if mode requires a primary_bead
 */
export function requiresBead(mode: ArtifactMode): boolean {
  return mode === 'handoff' || mode === 'finalize';
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate artifact at runtime (lightweight)
 */
export function isValidArtifact(obj: unknown): obj is UnifiedArtifact {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const candidate = obj as Record<string, unknown>;

  if (!candidate.schema_version || typeof candidate.schema_version !== 'string') {
    return false;
  }

  if (!candidate.mode || typeof candidate.mode !== 'string') {
    return false;
  }

  if (!candidate.date || typeof candidate.date !== 'string') {
    return false;
  }

  if (!candidate.session || typeof candidate.session !== 'string') {
    return false;
  }

  if (!candidate.goal || typeof candidate.goal !== 'string') {
    return false;
  }

  if (!candidate.now || typeof candidate.now !== 'string') {
    return false;
  }

  if (!candidate.outcome || !['SUCCEEDED', 'PARTIAL_PLUS', 'PARTIAL_MINUS', 'FAILED'].includes(candidate.outcome as string)) {
    return false;
  }

  if (!candidate.mode || !['checkpoint', 'handoff', 'finalize'].includes(candidate.mode as string)) {
    return false;
  }

  const mode = candidate.mode as ArtifactMode;
  if (requiresBead(mode)) {
    if (!candidate.primary_bead || typeof candidate.primary_bead !== 'string') {
      return false;
    }
  }

  return true;
}

/**
 * Backward-compatible alias for validation
 */
export function validateArtifact(obj: unknown): obj is UnifiedArtifact {
  return isValidArtifact(obj);
}

// =============================================================================
// Artifact Factory
// =============================================================================

/**
 * Create a minimal valid artifact
 */
export function createArtifact(
  mode: ArtifactMode,
  goal: string,
  now: string,
  outcome: SessionOutcome,
  options: {
    session: string;
    date?: string;
    primary_bead?: string;
    session_id?: string;
    agent_id?: string;
    root_span_id?: string;
    turn_span_id?: string;
    metadata?: Record<string, unknown>;
  }
): UnifiedArtifact {
  if (!options.session) {
    throw new Error('Artifacts require a session name');
  }

  const base: BaseArtifact = {
    schema_version: ARTIFACT_SCHEMA_VERSION,
    mode,
    date: options.date || new Date().toISOString(),
    session: options.session,
    outcome,
    primary_bead: options.primary_bead,
    session_id: options.session_id,
    agent_id: options.agent_id,
    root_span_id: options.root_span_id,
    turn_span_id: options.turn_span_id,
    goal,
    now,
    metadata: options.metadata,
  };

  if (mode === 'checkpoint') {
    // Checkpoint can optionally include primary_bead
    if (!options.primary_bead) {
      delete base.primary_bead;
    }
    return base as CheckpointArtifact;
  }

  if (mode === 'handoff') {
    if (!options.primary_bead) {
      throw new Error('Handoff artifacts require a primary_bead');
    }
    return base as HandoffArtifact;
  }

  if (mode === 'finalize') {
    if (!options.primary_bead) {
      throw new Error('Finalize artifacts require a primary_bead');
    }
    return base as FinalizeArtifact;
  }

  throw new Error(`Unknown mode: ${mode}`);
}
