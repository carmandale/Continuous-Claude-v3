// src/handoff-index.ts
import * as fs from "fs";
import * as path from "path";
import { spawn, execSync } from "child_process";
import Database from "better-sqlite3";

// src/shared/opc-path.ts
import { existsSync } from "fs";
import { join } from "path";
function getOpcDir() {
  const envOpcDir = process.env.CLAUDE_OPC_DIR;
  if (envOpcDir && existsSync(envOpcDir)) {
    return envOpcDir;
  }
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const localOpc = join(projectDir, "opc");
  if (existsSync(localOpc)) {
    return localOpc;
  }
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  if (homeDir) {
    const globalClaude = join(homeDir, ".claude");
    const globalScripts = join(globalClaude, "scripts", "core");
    if (existsSync(globalScripts)) {
      return globalClaude;
    }
  }
  return null;
}

// src/handoff-index.ts
function getCoordinationSessionId(inputSessionId) {
  return process.env.BRAINTRUST_SPAN_ID?.slice(0, 8) || inputSessionId;
}
function getPpid(pid) {
  if (process.platform === "win32") {
    try {
      const result = execSync(`wmic process where ProcessId=${pid} get ParentProcessId`, {
        encoding: "utf-8",
        timeout: 5e3
      });
      for (const line of result.split("\n")) {
        const trimmed = line.trim();
        if (/^\d+$/.test(trimmed)) {
          return parseInt(trimmed, 10);
        }
      }
    } catch {
    }
    return null;
  }
  try {
    const result = execSync(`ps -o ppid= -p ${pid}`, {
      encoding: "utf-8",
      timeout: 5e3
    });
    const ppid = parseInt(result.trim(), 10);
    return isNaN(ppid) ? null : ppid;
  } catch {
    return null;
  }
}
function getTerminalShellPid() {
  try {
    const parent = process.ppid;
    if (!parent) return null;
    const grandparent = getPpid(parent);
    if (!grandparent) return null;
    return getPpid(grandparent);
  } catch {
    return null;
  }
}
function storeSessionAffinity(projectDir, terminalPid, sessionName) {
  const dbPath = path.join(projectDir, ".claude", "cache", "artifact-index", "context.db");
  const dbDir = path.dirname(dbPath);
  try {
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }
    const db = new Database(dbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS instance_sessions (
        terminal_pid TEXT PRIMARY KEY,
        session_name TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO instance_sessions (terminal_pid, session_name, updated_at)
      VALUES (?, ?, datetime('now'))
    `);
    stmt.run(terminalPid.toString(), sessionName);
    db.close();
  } catch {
  }
}
function extractSessionName(filePath) {
  const parts = filePath.split(/[/\\]/);
  const handoffsIdx = parts.findIndex((p) => p === "handoffs");
  if (handoffsIdx >= 0 && handoffsIdx < parts.length - 1) {
    return parts[handoffsIdx + 1];
  }
  return null;
}
function isHandoffArtifact(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  return normalized.includes("thoughts/shared/handoffs/") && (normalized.endsWith(".md") || normalized.endsWith(".yaml") || normalized.endsWith(".yml"));
}
function extractFrontmatter(content) {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return {};
  }
  const frontmatterText = frontmatterMatch[1];
  const metadata = {};
  const lines = frontmatterText.split("\n");
  for (const line of lines) {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (match) {
      const [, key, value] = match;
      if (key === "mode") {
        metadata.mode = value;
      } else if (key === "schema_version") {
        metadata.schema_version = value;
      } else if (key === "session") {
        metadata.session = value;
      } else if (key === "primary_bead") {
        metadata.primary_bead = value;
      } else if (key === "session_id") {
        metadata.session_id = value;
      } else if (key === "root_span_id") {
        metadata.root_span_id = value;
      } else if (key === "turn_span_id") {
        metadata.turn_span_id = value;
      }
    }
  }
  return metadata;
}
async function main() {
  const input = JSON.parse(await readStdin());
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  if (input.tool_name !== "Write") {
    console.log(JSON.stringify({ result: "continue" }));
    return;
  }
  const filePath = input.tool_input?.file_path || "";
  if (!isHandoffArtifact(filePath)) {
    console.log(JSON.stringify({ result: "continue" }));
    return;
  }
  try {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(projectDir, filePath);
    if (!fs.existsSync(fullPath)) {
      console.log(JSON.stringify({ result: "continue" }));
      return;
    }
    const ext = path.extname(fullPath).toLowerCase();
    let content = fs.readFileSync(fullPath, "utf-8");
    const frontmatter = extractFrontmatter(content);
    const hasFrontmatter = content.startsWith("---");
    const hasRootSpanId = content.includes("root_span_id:");
    if (!hasRootSpanId) {
      const stateFile = path.join(homeDir, ".claude", "state", "braintrust_sessions", `${input.session_id}.json`);
      if (fs.existsSync(stateFile)) {
        try {
          const stateContent = fs.readFileSync(stateFile, "utf-8");
          const state = JSON.parse(stateContent);
          const newFields = [
            `root_span_id: ${state.root_span_id}`,
            `turn_span_id: ${state.current_turn_span_id || ""}`,
            `session_id: ${input.session_id}`
          ].join("\n");
          if (hasFrontmatter) {
            content = content.replace(/^---\n/, `---
${newFields}
`);
          } else {
            content = `---
${newFields}
---

${content}`;
          }
          const tempPath = fullPath + ".tmp";
          fs.writeFileSync(tempPath, content);
          fs.renameSync(tempPath, fullPath);
        } catch {
        }
      }
    }
    const terminalPid = getTerminalShellPid();
    const sessionName = frontmatter.session || extractSessionName(fullPath);
    if (terminalPid && sessionName) {
      storeSessionAffinity(projectDir, terminalPid, sessionName);
    }
    const opcDir = getOpcDir();
    if (opcDir) {
      const coordinationSessionId = getCoordinationSessionId(input.session_id);
      const ingest = spawn(
        "uv",
        ["run", "python", "scripts/core/handoff_ingest.py", "--file", fullPath, "--session-id", coordinationSessionId],
        { cwd: opcDir, detached: true, stdio: "ignore" }
      );
      ingest.unref();
      if (ext === ".md") {
        const indexer = spawn(
          "uv",
          ["run", "python", "scripts/core/artifact_index.py", "--file", fullPath],
          { cwd: opcDir, detached: true, stdio: "ignore" }
        );
        indexer.unref();
      }
    }
    console.log(JSON.stringify({ result: "continue" }));
  } catch {
    console.log(JSON.stringify({ result: "continue" }));
  }
}
async function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.on("data", (chunk) => data += chunk);
    process.stdin.on("end", () => resolve(data));
  });
}
main().catch(console.error);
