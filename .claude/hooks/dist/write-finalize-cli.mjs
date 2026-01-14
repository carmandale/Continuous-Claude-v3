#!/usr/bin/env node

// src/shared/artifact-writer.ts
import { writeFile, mkdir } from "fs/promises";
import { join as join2 } from "path";
import { existsSync } from "fs";
import YAML from "yaml";

// src/shared/artifact-validator.ts
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
var __filename = fileURLToPath(import.meta.url);
var __dirname = dirname(__filename);
var schemaCache = null;
function loadSchema() {
  if (schemaCache) {
    return schemaCache;
  }
  const schemaPath = join(__dirname, "artifact-schema.json");
  const schemaText = readFileSync(schemaPath, "utf-8");
  schemaCache = JSON.parse(schemaText);
  return schemaCache;
}
var validatorCache = null;
function getValidator() {
  if (validatorCache) {
    return validatorCache;
  }
  const ajv = new Ajv({
    allErrors: true,
    // Report all errors, not just first
    verbose: true,
    // Include data in error objects
    strict: false,
    // Allow flexible JSON Schema patterns
    validateFormats: true
    // Validate format keywords
  });
  addFormats(ajv);
  const schema = loadSchema();
  validatorCache = ajv.compile(schema);
  return validatorCache;
}
function formatError(error) {
  const field = error.instancePath || "(root)";
  switch (error.keyword) {
    case "required":
      return {
        field,
        message: `Missing required field: ${error.params.missingProperty}`
      };
    case "type":
      return {
        field,
        message: `Invalid type: expected ${error.params.type}`,
        value: error.data
      };
    case "enum":
      return {
        field,
        message: `Invalid value: must be one of ${error.params.allowedValues?.join(", ")}`,
        value: error.data
      };
    case "pattern":
      return {
        field,
        message: `Invalid format: must match pattern ${error.params.pattern}`,
        value: error.data
      };
    case "format":
      return {
        field,
        message: `Invalid format: expected ${error.params.format}`,
        value: error.data
      };
    case "minLength":
      return {
        field,
        message: `Too short: minimum length is ${error.params.limit}`,
        value: error.data
      };
    case "additionalProperties":
      return {
        field: `${field}/${error.params.additionalProperty}`,
        message: "Additional property not allowed by schema"
      };
    case "if":
    case "then":
      return {
        field,
        message: error.message || "Conditional validation failed"
      };
    default:
      return {
        field,
        message: error.message || "Validation failed",
        value: error.data
      };
  }
}
function formatErrorMessage(errors) {
  const lines = ["Artifact validation failed:"];
  for (const error of errors) {
    lines.push(`  \u2022 ${error.field}: ${error.message}`);
    if (error.value !== void 0) {
      lines.push(`    Got: ${JSON.stringify(error.value)}`);
    }
  }
  return lines.join("\n");
}
function validateArtifactSchema(artifact) {
  const validator = getValidator();
  const valid = validator(artifact);
  if (valid) {
    return { valid: true };
  }
  const errors = (validator.errors || []).map(formatError);
  return {
    valid: false,
    errors
  };
}
function assertValidArtifact(artifact) {
  const result = validateArtifactSchema(artifact);
  if (!result.valid) {
    const message = formatErrorMessage(result.errors || []);
    throw new Error(message);
  }
}

// src/shared/artifact-writer.ts
var ARTIFACT_DIR = "thoughts/shared/handoffs/events";
function generateFilename(timestamp, sessionId) {
  const fileTimestamp = timestamp.replace(/:/g, "-").replace(/\.\d{3}Z$/, (ms) => ms);
  const id = sessionId || generateSessionId();
  return `${fileTimestamp}_${id}.md`;
}
function generateSessionId() {
  return Math.random().toString(16).slice(2, 10).padEnd(8, "0");
}
function formatArtifactYaml(artifact) {
  const yamlContent = YAML.stringify(artifact, {
    lineWidth: 0,
    // Don't wrap long lines
    defaultStringType: "PLAIN",
    // Don't quote simple strings
    defaultKeyType: "PLAIN"
    // Plain keys (no quotes)
  });
  return `---
${yamlContent}---
`;
}
function resolveArtifactPath(filename, baseDir = process.cwd()) {
  return join2(baseDir, ARTIFACT_DIR, filename);
}
async function ensureArtifactDir(baseDir = process.cwd()) {
  const dirPath = join2(baseDir, ARTIFACT_DIR);
  if (!existsSync(dirPath)) {
    await mkdir(dirPath, { recursive: true });
  }
}
async function writeArtifact(artifact, options) {
  assertValidArtifact(artifact);
  const filename = generateFilename(artifact.timestamp, artifact.session_id);
  const content = formatArtifactYaml(artifact);
  const baseDir = options?.baseDir || process.cwd();
  const filePath = resolveArtifactPath(filename, baseDir);
  if (options?.dryRun) {
    return filePath;
  }
  await ensureArtifactDir(baseDir);
  try {
    await writeFile(filePath, content, "utf-8");
    return filePath;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to write artifact to ${filePath}: ${message}`);
  }
}

// src/shared/artifact-schema.ts
var ARTIFACT_SCHEMA_VERSION = "1.0.0";
function createArtifact(eventType, goal, now, outcome, options) {
  const base = {
    schema_version: ARTIFACT_SCHEMA_VERSION,
    event_type: eventType,
    timestamp: options?.timestamp || (/* @__PURE__ */ new Date()).toISOString(),
    session_id: options?.session_id,
    session_name: options?.session_name,
    goal,
    now,
    outcome,
    metadata: options?.metadata
  };
  if (eventType === "checkpoint") {
    if (options?.primary_bead) {
      return {
        ...base,
        primary_bead: options.primary_bead
      };
    }
    return base;
  }
  if (eventType === "handoff") {
    if (!options?.primary_bead) {
      throw new Error("Handoff artifacts require a primary_bead");
    }
    return {
      ...base,
      primary_bead: options.primary_bead
    };
  }
  if (eventType === "finalize") {
    if (!options?.primary_bead) {
      throw new Error("Finalize artifacts require a primary_bead");
    }
    return {
      ...base,
      primary_bead: options.primary_bead
    };
  }
  throw new Error(`Unknown event type: ${eventType}`);
}

// src/write-finalize-cli.ts
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const value = args[i + 1];
    if (arg.startsWith("--")) {
      let key = arg.slice(2);
      if (key === "bead") {
        key = "primary_bead";
      }
      if (key === "next" || key === "blockers" || key === "questions") {
        if (!parsed[key]) {
          parsed[key] = [];
        }
        parsed[key].push(value);
        i++;
        continue;
      }
      if (value !== void 0) {
        parsed[key] = value;
        i++;
      }
    }
  }
  if (!parsed.goal || !parsed.now || !parsed.outcome || !parsed.primary_bead) {
    console.error("Error: Missing required arguments");
    console.error("Required: --goal, --now, --outcome, --primary_bead");
    console.error("");
    console.error("Usage:");
    console.error("  node write-finalize-cli.js \\");
    console.error('    --goal "Goal description" \\');
    console.error('    --now "Final status" \\');
    console.error("    --outcome SUCCEEDED \\");
    console.error("    --primary_bead beads-xxx \\");
    console.error("    [--session_id abc123] \\");
    console.error('    [--test "pytest tests/"] \\');
    console.error(`    [--final_solutions '[{"problem":"...","solution":"..."}]'] \\`);
    console.error(`    [--final_decisions '[{"decision":"...","rationale":"..."}]']`);
    process.exit(1);
  }
  return parsed;
}
async function main() {
  try {
    const args = parseArgs();
    const artifact = createArtifact(
      "finalize",
      args.goal,
      args.now,
      args.outcome,
      {
        primary_bead: args.primary_bead,
        session_id: args.session_id,
        session_name: args.session_name
      }
    );
    if (args.test) artifact.test = args.test;
    if (args.next) artifact.next = args.next;
    if (args.blockers) artifact.blockers = args.blockers;
    if (args.questions) artifact.questions = args.questions;
    if (args.this_session) {
      artifact.this_session = JSON.parse(args.this_session);
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
    if (args.final_solutions) {
      artifact.final_solutions = JSON.parse(args.final_solutions);
    }
    if (args.final_decisions) {
      artifact.final_decisions = JSON.parse(args.final_decisions);
    }
    if (args.artifacts_produced) {
      artifact.artifacts_produced = JSON.parse(args.artifacts_produced);
    }
    const filePath = await writeArtifact(artifact);
    console.log(JSON.stringify({
      success: true,
      path: filePath,
      artifact: {
        event_type: artifact.event_type,
        timestamp: artifact.timestamp,
        session_id: artifact.session_id,
        primary_bead: artifact.primary_bead
      }
    }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error)
    }, null, 2));
    process.exit(1);
  }
}
main();
