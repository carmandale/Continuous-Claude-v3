/**
 * Unified Artifact Schema for Checkpoint, Handoff, and Finalize events.
 *
 * This schema defines the common structure for all session artifacts,
 * supporting three modes with shared and mode-specific fields.
 *
 * Design principles:
 * - Single source of truth for artifact structure
 * - Extensible via metadata object
 * - Type-safe validation at compile time
 * - JSON Schema validation at runtime
 *
 * Related:
 * - Plan: thoughts/shared/plans/2026-01-13-unified-artifact-system.md
 * - Examples: thoughts/shared/handoffs/
 */

// =============================================================================
// Core Types
// =============================================================================

/**
 * Artifact event types - three entry points to the same core function
 */
export type ArtifactEventType = 'checkpoint' | 'handoff' | 'finalize';

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
 * Learnings categorized by success/failure
 */
export interface Learnings {
  worked?: string[];
  failed?: string[];
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
  primary_bead: string;
  related_beads?: string[];
  files_to_review?: FileReference[];
  continuation_prompt?: string;
}

/**
 * Finalize-specific fields for session closure
 */
export interface FinalizeFields {
  primary_bead: string;
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
  // Schema metadata
  schema_version: string;
  event_type: ArtifactEventType;

  // Session metadata
  timestamp: string;  // ISO 8601
  session_id?: string;
  session_name?: string;

  // Core content
  goal: string;
  now: string;
  outcome: SessionOutcome;

  // Progress tracking
  this_session?: CompletedTask[];
  next?: string[];
  blockers?: string[];
  questions?: string[];

  // Knowledge capture
  decisions?: Record<string, string> | Decision[];
  learnings?: Learnings;
  findings?: Record<string, string>;

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
  event_type: 'checkpoint';
}

/**
 * Handoff artifact - transfer package
 */
export interface HandoffArtifact extends BaseArtifact, HandoffFields {
  event_type: 'handoff';
}

/**
 * Finalize artifact - session memorial
 */
export interface FinalizeArtifact extends BaseArtifact, FinalizeFields {
  event_type: 'finalize';
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
  return artifact.event_type === 'checkpoint';
}

/**
 * Check if artifact is a handoff
 */
export function isHandoff(artifact: UnifiedArtifact): artifact is HandoffArtifact {
  return artifact.event_type === 'handoff';
}

/**
 * Check if artifact is a finalize
 */
export function isFinalize(artifact: UnifiedArtifact): artifact is FinalizeArtifact {
  return artifact.event_type === 'finalize';
}

/**
 * Check if artifact requires a bead
 */
export function requiresBead(eventType: ArtifactEventType): boolean {
  return eventType === 'handoff' || eventType === 'finalize';
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate artifact structure at runtime (basic TypeScript checks)
 *
 * @deprecated Use validateArtifactSchema() from artifact-validator.ts for full JSON Schema validation
 */
export function validateArtifact(artifact: unknown): artifact is UnifiedArtifact {
  if (!artifact || typeof artifact !== 'object') {
    return false;
  }

  const obj = artifact as Record<string, unknown>;

  // Required fields
  if (!obj.schema_version || typeof obj.schema_version !== 'string') {
    return false;
  }

  if (!obj.event_type || !['checkpoint', 'handoff', 'finalize'].includes(obj.event_type as string)) {
    return false;
  }

  if (!obj.timestamp || typeof obj.timestamp !== 'string') {
    return false;
  }

  if (!obj.goal || typeof obj.goal !== 'string') {
    return false;
  }

  if (!obj.now || typeof obj.now !== 'string') {
    return false;
  }

  if (!obj.outcome || !['SUCCEEDED', 'PARTIAL_PLUS', 'PARTIAL_MINUS', 'FAILED'].includes(obj.outcome as string)) {
    return false;
  }

  // Mode-specific validation
  const eventType = obj.event_type as ArtifactEventType;

  if (requiresBead(eventType)) {
    if (!obj.primary_bead || typeof obj.primary_bead !== 'string') {
      return false;
    }
  }

  return true;
}

/**
 * Create a minimal valid artifact
 */
export function createArtifact(
  eventType: ArtifactEventType,
  goal: string,
  now: string,
  outcome: SessionOutcome,
  options?: {
    timestamp?: string;
    session_id?: string;
    session_name?: string;
    primary_bead?: string;
    metadata?: Record<string, unknown>;
  }
): UnifiedArtifact {
  const base: BaseArtifact = {
    schema_version: ARTIFACT_SCHEMA_VERSION,
    event_type: eventType,
    timestamp: options?.timestamp || new Date().toISOString(),
    session_id: options?.session_id,
    session_name: options?.session_name,
    goal,
    now,
    outcome,
    metadata: options?.metadata,
  };

  if (eventType === 'checkpoint') {
    return base as CheckpointArtifact;
  }

  if (eventType === 'handoff') {
    if (!options?.primary_bead) {
      throw new Error('Handoff artifacts require a primary_bead');
    }
    return {
      ...base,
      primary_bead: options.primary_bead,
    } as HandoffArtifact;
  }

  if (eventType === 'finalize') {
    if (!options?.primary_bead) {
      throw new Error('Finalize artifacts require a primary_bead');
    }
    return {
      ...base,
      primary_bead: options.primary_bead,
    } as FinalizeArtifact;
  }

  throw new Error(`Unknown event type: ${eventType}`);
}
