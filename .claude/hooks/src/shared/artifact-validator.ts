/**
 * JSON Schema-based artifact validation using Ajv.
 *
 * Provides runtime validation against the unified artifact schema,
 * catching invalid artifacts before they're written to disk.
 *
 * Related:
 * - Schema: artifact-schema.json
 * - Types: artifact-schema.ts
 * - Tests: __tests__/artifact-validator.test.ts
 */

import Ajv from 'ajv';
import type { ValidateFunction, ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { UnifiedArtifact } from './artifact-schema.js';

// =============================================================================
// Schema Loading
// =============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let schemaCache: Record<string, unknown> | null = null;

/**
 * Load JSON Schema from disk (cached)
 */
function loadSchema(): Record<string, unknown> {
  if (schemaCache) {
    return schemaCache;
  }

  const schemaPath = join(__dirname, 'artifact-schema.json');
  const schemaText = readFileSync(schemaPath, 'utf-8');
  schemaCache = JSON.parse(schemaText) as Record<string, unknown>;
  return schemaCache;
}

// =============================================================================
// Validator Setup
// =============================================================================

let validatorCache: ValidateFunction | null = null;

/**
 * Get compiled Ajv validator (cached)
 */
function getValidator(): ValidateFunction {
  if (validatorCache) {
    return validatorCache;
  }

  const ajv = new Ajv({
    allErrors: true,        // Report all errors, not just first
    verbose: true,          // Include data in error objects
    strict: false,          // Allow flexible JSON Schema patterns
    validateFormats: true,  // Validate format keywords
  });

  // Add format validators (date-time, uri, etc.)
  addFormats(ajv);

  const schema = loadSchema();
  validatorCache = ajv.compile(schema);
  return validatorCache;
}

// =============================================================================
// Validation Result Types
// =============================================================================

/**
 * Structured validation error with field path and message
 */
export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

/**
 * Validation result - either success or list of errors
 */
export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
}

// =============================================================================
// Error Formatting
// =============================================================================

/**
 * Convert Ajv error to human-readable ValidationError
 */
function formatError(error: ErrorObject): ValidationError {
  const field = error.instancePath || '(root)';

  // Handle different error types with specific messages
  switch (error.keyword) {
    case 'required':
      return {
        field,
        message: `Missing required field: ${error.params.missingProperty}`,
      };

    case 'type':
      return {
        field,
        message: `Invalid type: expected ${error.params.type}`,
        value: error.data,
      };

    case 'enum':
      return {
        field,
        message: `Invalid value: must be one of ${error.params.allowedValues?.join(', ')}`,
        value: error.data,
      };

    case 'pattern':
      return {
        field,
        message: `Invalid format: must match pattern ${error.params.pattern}`,
        value: error.data,
      };

    case 'format':
      return {
        field,
        message: `Invalid format: expected ${error.params.format}`,
        value: error.data,
      };

    case 'minLength':
      return {
        field,
        message: `Too short: minimum length is ${error.params.limit}`,
        value: error.data,
      };

    case 'additionalProperties':
      return {
        field: `${field}/${error.params.additionalProperty}`,
        message: 'Additional property not allowed by schema',
      };

    case 'if':
    case 'then':
      // Conditional schema errors (e.g., handoff requires primary_bead)
      return {
        field,
        message: error.message || 'Conditional validation failed',
      };

    default:
      return {
        field,
        message: error.message || 'Validation failed',
        value: error.data,
      };
  }
}

/**
 * Format validation errors into user-friendly message
 */
function formatErrorMessage(errors: ValidationError[]): string {
  const lines = ['Artifact validation failed:'];

  for (const error of errors) {
    lines.push(`  • ${error.field}: ${error.message}`);
    if (error.value !== undefined) {
      lines.push(`    Got: ${JSON.stringify(error.value)}`);
    }
  }

  return lines.join('\n');
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Validate artifact against JSON Schema
 *
 * @param artifact - Artifact to validate
 * @returns Validation result with detailed errors
 *
 * @example
 * const result = validateArtifactSchema(artifact);
 * if (!result.valid) {
 *   console.error('Validation failed:', result.errors);
 * }
 */
export function validateArtifactSchema(artifact: unknown): ValidationResult {
  const validator = getValidator();
  const valid = validator(artifact);

  if (valid) {
    return { valid: true };
  }

  // Format errors for human consumption
  const errors = (validator.errors || []).map(formatError);

  return {
    valid: false,
    errors,
  };
}

/**
 * Validate artifact and throw on failure
 *
 * @param artifact - Artifact to validate
 * @throws Error with detailed validation errors
 *
 * @example
 * try {
 *   assertValidArtifact(artifact);
 *   // Proceed with writing
 * } catch (error) {
 *   console.error('Invalid artifact:', error.message);
 * }
 */
export function assertValidArtifact(artifact: unknown): asserts artifact is UnifiedArtifact {
  const result = validateArtifactSchema(artifact);

  if (!result.valid) {
    const message = formatErrorMessage(result.errors || []);
    throw new Error(message);
  }
}

/**
 * Check if artifact is valid (boolean convenience)
 *
 * @param artifact - Artifact to validate
 * @returns True if valid, false otherwise
 *
 * @example
 * if (isValidArtifact(artifact)) {
 *   await writeArtifact(artifact);
 * }
 */
export function isValidArtifact(artifact: unknown): artifact is UnifiedArtifact {
  return validateArtifactSchema(artifact).valid;
}
