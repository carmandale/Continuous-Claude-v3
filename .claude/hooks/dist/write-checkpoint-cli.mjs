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
var ARTIFACT_DIR = "thoughts/shared/handoffs";
var FRONTMATTER_KEYS = /* @__PURE__ */ new Set([
  "schema_version",
  "mode",
  "date",
  "session",
  "outcome",
  "primary_bead",
  "session_id",
  "agent_id",
  "root_span_id",
  "turn_span_id"
]);
function slugify(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "session";
}
function formatDateForFilename(dateValue) {
  const match = dateValue.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (match) {
    const [, date, hour, minute] = match;
    const hh2 = hour || "00";
    const mm2 = minute || "00";
    return `${date}_${hh2}-${mm2}`;
  }
  const now = /* @__PURE__ */ new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const min = String(now.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}_${hh}-${min}`;
}
function getTitleSlug(artifact) {
  const session = artifact.session || "session";
  const bead = artifact.primary_bead;
  if (bead && session.startsWith(`${bead}-`)) {
    return slugify(session.slice(bead.length + 1));
  }
  return slugify(session);
}
function generateFilename(artifact) {
  const datePart = formatDateForFilename(artifact.date);
  const titleSlug = getTitleSlug(artifact);
  return `${datePart}_${titleSlug}_${artifact.mode}.yaml`;
}
function formatArtifactYaml(artifact) {
  const frontmatter = {};
  const body = {};
  for (const [key, value] of Object.entries(artifact)) {
    if (value === void 0) continue;
    if (FRONTMATTER_KEYS.has(key)) {
      frontmatter[key] = value;
    } else {
      body[key] = value;
    }
  }
  const front = YAML.stringify(frontmatter, {
    lineWidth: 0,
    defaultStringType: "PLAIN",
    defaultKeyType: "PLAIN"
  }).trimEnd();
  const bodyYaml = YAML.stringify(body, {
    lineWidth: 0,
    defaultStringType: "PLAIN",
    defaultKeyType: "PLAIN"
  }).trimEnd();
  if (bodyYaml) {
    return `---
${front}
---

${bodyYaml}
`;
  }
  return `---
${front}
---
`;
}
function getSessionDir(artifact, baseDir) {
  return join2(baseDir, ARTIFACT_DIR, artifact.session);
}
function resolveArtifactPath(artifact, baseDir = process.cwd()) {
  const filename = generateFilename(artifact);
  return join2(getSessionDir(artifact, baseDir), filename);
}
async function ensureArtifactDir(artifact, baseDir = process.cwd()) {
  const dirPath = getSessionDir(artifact, baseDir);
  if (!existsSync(dirPath)) {
    await mkdir(dirPath, { recursive: true });
  }
}
async function writeArtifact(artifact, options) {
  assertValidArtifact(artifact);
  const content = formatArtifactYaml(artifact);
  const baseDir = options?.baseDir || process.cwd();
  const filePath = resolveArtifactPath(artifact, baseDir);
  if (options?.dryRun) {
    return filePath;
  }
  await ensureArtifactDir(artifact, baseDir);
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
function createArtifact(mode, goal, now, outcome, options) {
  if (!options.session) {
    throw new Error("Artifacts require a session name");
  }
  const base = {
    schema_version: ARTIFACT_SCHEMA_VERSION,
    mode,
    date: options.date || (/* @__PURE__ */ new Date()).toISOString(),
    session: options.session,
    outcome,
    primary_bead: options.primary_bead,
    session_id: options.session_id,
    agent_id: options.agent_id,
    root_span_id: options.root_span_id,
    turn_span_id: options.turn_span_id,
    goal,
    now,
    metadata: options.metadata
  };
  if (mode === "checkpoint") {
    if (!options.primary_bead) {
      delete base.primary_bead;
    }
    return base;
  }
  if (mode === "handoff") {
    if (!options.primary_bead) {
      throw new Error("Handoff artifacts require a primary_bead");
    }
    return base;
  }
  if (mode === "finalize") {
    if (!options.primary_bead) {
      throw new Error("Finalize artifacts require a primary_bead");
    }
    return base;
  }
  throw new Error(`Unknown mode: ${mode}`);
}

// src/write-checkpoint-cli.ts
function slugify2(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "session";
}
function normalizeSessionName(value) {
  return value.trim().replace(/\s+/g, "-");
}
function buildSessionName(args) {
  if (args.session) {
    return normalizeSessionName(args.session);
  }
  if (args.primary_bead) {
    const titleSource = args.session_title || args.goal;
    return `${args.primary_bead}-${slugify2(titleSource)}`;
  }
  if (args.session_title) {
    return slugify2(args.session_title);
  }
  throw new Error("session name is required when no primary_bead is provided");
}
function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const value = args[i + 1];
    if (arg.startsWith("--")) {
      let key = arg.slice(2);
      if (key === "session_name" || key === "session-name") {
        key = "session";
      }
      if (key === "session_title" || key === "session-title") {
        key = "session_title";
      }
      if (key === "done_this_session" || key === "done-this-session") {
        key = "done_this_session";
      }
      if (key === "next" || key === "blockers" || key === "questions" || key === "worked" || key === "failed") {
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
  if (!parsed.goal || !parsed.now || !parsed.outcome) {
    console.error("Error: Missing required arguments");
    console.error("Required: --goal, --now, --outcome");
    console.error("");
    console.error("Usage:");
    console.error("  node write-checkpoint-cli.js \\");
    console.error('    --goal "Goal description" \\');
    console.error('    --now "Current focus" \\');
    console.error("    --outcome PARTIAL_PLUS \\");
    console.error("    [--primary_bead beads-xxx] \\");
    console.error('    [--session "bead-short-title"] \\');
    console.error('    [--session-title "short title"] \\');
    console.error('    [--test "pytest tests/"] \\');
    console.error('    [--next "First step"] \\');
    console.error('    [--blockers "Blocker 1"]');
    process.exit(1);
  }
  return parsed;
}
async function main() {
  try {
    const args = parseArgs();
    const session = buildSessionName(args);
    const artifact = createArtifact(
      "checkpoint",
      args.goal,
      args.now,
      args.outcome,
      {
        primary_bead: args.primary_bead,
        session,
        session_id: args.session_id
      }
    );
    if (args.test) artifact.test = args.test;
    if (args.next) artifact.next = args.next;
    if (args.blockers) artifact.blockers = args.blockers;
    if (args.questions) artifact.questions = args.questions;
    if (args.worked) artifact.worked = args.worked;
    if (args.failed) artifact.failed = args.failed;
    if (args.done_this_session) {
      artifact.done_this_session = JSON.parse(args.done_this_session);
    }
    if (args.decisions) {
      artifact.decisions = JSON.parse(args.decisions);
    }
    if (args.findings) {
      artifact.findings = JSON.parse(args.findings);
    }
    if (args.learnings) {
      const learnings = JSON.parse(args.learnings);
      if (learnings.worked) artifact.worked = learnings.worked;
      if (learnings.failed) artifact.failed = learnings.failed;
    }
    if (args.git) {
      artifact.git = JSON.parse(args.git);
    }
    if (args.files) {
      artifact.files = JSON.parse(args.files);
    }
    const filePath = await writeArtifact(artifact);
    console.log(JSON.stringify({
      success: true,
      path: filePath,
      artifact: {
        mode: artifact.mode,
        date: artifact.date,
        session: artifact.session,
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
