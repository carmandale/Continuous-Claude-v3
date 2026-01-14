/**
 * Python Bridge
 *
 * Subprocess wrappers to call Python validation and inference scripts.
 * Provides type-safe interface between TypeScript hooks and Python logic.
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import type { ValidationResult, PatternInferenceResult, PatternType, ScopeType } from './pattern-selector.js';

// Get project root - from .claude/hooks/src/shared/ go up 4 levels
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || resolve(__dirname, '..', '..', '..', '..');

const VALIDATE_SCRIPT = resolve(PROJECT_DIR, 'scripts', 'validate_composition.py');
const INFERENCE_SCRIPT = resolve(PROJECT_DIR, 'scripts', 'agentica_patterns', 'pattern_inference.py');

const FALLBACK_SCOPES: Record<string, ScopeType[]> = {
  jury: ['iso'],
  blackboard: ['shared'],
  swarm: ['iso', 'shared'],
  hierarchical: ['shared', 'fed'],
  pipeline: ['handoff', 'shared', 'iso', 'fed'],
  aggregator: ['handoff', 'shared', 'iso', 'fed'],
  map_reduce: ['handoff', 'shared', 'iso', 'fed'],
  generator_critic: ['handoff', 'shared', 'iso', 'fed'],
  circuit_breaker: ['handoff', 'shared', 'iso', 'fed'],
  chain_of_responsibility: ['handoff', 'shared', 'iso', 'fed'],
  adversarial: ['handoff', 'shared', 'iso', 'fed'],
  event_driven: ['handoff', 'shared', 'iso', 'fed'],
  consensus: ['handoff', 'shared', 'iso', 'fed'],
  broadcast: ['handoff', 'shared', 'iso', 'fed'],
};

function normalizePattern(pattern: string): string {
  return (pattern || '').trim().toLowerCase();
}

function fallbackValidateComposition(
  patternA: string,
  patternB: string,
  scope: ScopeType,
  operator: string
): ValidationResult {
  const left = normalizePattern(patternA);
  const right = normalizePattern(patternB);
  const expr = `${left} ${operator}[${scope}] ${right}`;

  const leftScopes = FALLBACK_SCOPES[left];
  const rightScopes = FALLBACK_SCOPES[right];

  if (!leftScopes || !rightScopes) {
    const missing = !leftScopes ? left : right;
    return {
      valid: false,
      composition: expr,
      errors: [`Unknown pattern: ${missing}`],
      warnings: [],
      scopeTrace: [],
    };
  }

  if (!leftScopes.includes(scope) || !rightScopes.includes(scope)) {
    return {
      valid: false,
      composition: expr,
      errors: [`No compatible scope for ${left} -> ${right} with ${scope}`],
      warnings: [],
      scopeTrace: [],
    };
  }

  return {
    valid: true,
    composition: expr,
    errors: [],
    warnings: [],
    scopeTrace: [`${left}:${scope}`, `${right}:${scope}`],
  };
}

function fallbackInferPattern(prompt: string): PatternInferenceResult {
  const text = prompt.toLowerCase();
  let pattern: PatternType = 'hierarchical';
  let signals: string[] = [];
  let confidence = 0.6;

  if (/(research|investigate|explore|compare|survey)/.test(text)) {
    pattern = 'swarm';
    signals = ['research'];
  } else if (/(process|pipeline|stages|batch|stream)/.test(text)) {
    pattern = 'map_reduce';
    signals = ['pipeline'];
  } else if (/(implement|build|feature|tests?|refactor)/.test(text)) {
    pattern = 'hierarchical';
    signals = ['implementation'];
  } else {
    confidence = 0.4;
    signals = ['fallback'];
  }

  return {
    pattern,
    confidence,
    signals,
    needsClarification: false,
    clarificationProbe: null,
    ambiguityType: null,
    alternatives: [],
    workBreakdown: 'Heuristic fallback inference',
  };
}

/**
 * Call Python validate_composition.py with JSON output.
 *
 * @param patternA - First pattern name
 * @param patternB - Second pattern name
 * @param scope - State sharing scope
 * @param operator - Composition operator
 * @returns ValidationResult with validity, errors, warnings, and scope trace
 */
export function callValidateComposition(
  patternA: string,
  patternB: string,
  scope: string,
  operator: string = ';'
): ValidationResult {
  const expr = `${patternA} ${operator}[${scope}] ${patternB}`;
  if (!existsSync(VALIDATE_SCRIPT)) {
    return fallbackValidateComposition(patternA, patternB, scope as ScopeType, operator);
  }

  const cmd = `uv run python scripts/validate_composition.py --json "${expr}"`;

  try {
    const stdout = execSync(cmd, {
      cwd: PROJECT_DIR,
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const result = JSON.parse(stdout);

    // Map Python snake_case to TypeScript camelCase
    return {
      valid: result.all_valid ?? false,
      composition: result.expression ?? expr,
      errors: result.compositions?.[0]?.errors ?? [],
      warnings: result.compositions?.[0]?.warnings ?? [],
      scopeTrace: result.compositions?.[0]?.scope_trace ?? [],
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const fallback = fallbackValidateComposition(patternA, patternB, scope as ScopeType, operator);
    if (!fallback.valid) {
      fallback.errors = fallback.errors.map((msg) => `${msg}; Bridge error: ${errorMessage}`);
      return fallback;
    }
    return fallback;
  }
}

/**
 * Call Python pattern_inference.py to infer best pattern for a task.
 *
 * @param prompt - Task description
 * @returns PatternInferenceResult with pattern, confidence, and signals
 */
export function callPatternInference(prompt: string): PatternInferenceResult {
  // Escape double quotes and backslashes for shell safety
  const escaped = prompt.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  if (!existsSync(INFERENCE_SCRIPT)) {
    return fallbackInferPattern(prompt);
  }

  const cmd = `uv run python scripts/agentica_patterns/pattern_inference.py "${escaped}"`;

  try {
    const stdout = execSync(cmd, {
      cwd: PROJECT_DIR,
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const result = JSON.parse(stdout);

    return {
      pattern: result.pattern as PatternType,
      confidence: result.confidence ?? 0.5,
      signals: result.signals ?? [],
      needsClarification: result.needs_clarification ?? false,
      clarificationProbe: result.clarification_probe ?? null,
      ambiguityType: result.ambiguity_type ?? null,
      alternatives: (result.alternatives ?? []) as PatternType[],
      workBreakdown: result.work_breakdown ?? 'Task decomposition',
    };
  } catch (err) {
    return fallbackInferPattern(prompt);
  }
}
