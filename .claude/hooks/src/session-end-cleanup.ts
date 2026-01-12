import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface SessionEndInput {
  session_id: string;
  transcript_path: string;
  reason: 'clear' | 'logout' | 'prompt_input_exit' | 'other';
}

/**
 * Get the current git branch name.
 * Returns null if not in a git repo or on detached HEAD.
 */
function getGitBranch(cwd: string): string | null {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();
    // detached HEAD returns 'HEAD'
    return branch !== 'HEAD' ? branch : null;
  } catch {
    return null;
  }
}

/**
 * Get the main repo root, even if we're in a worktree.
 * For worktrees, returns the main repo path (not the worktree path).
 * This ensures events always go to a central location.
 */
function getMainRepoRoot(cwd: string): string {
  try {
    // git rev-parse --git-common-dir returns the shared .git directory
    // For main repo: returns ".git" or absolute path to .git
    // For worktree: returns "/path/to/main/repo/.git"
    const commonDir = execSync('git rev-parse --git-common-dir', {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();

    // Convert to absolute path if relative
    const absoluteCommonDir = path.isAbsolute(commonDir)
      ? commonDir
      : path.resolve(cwd, commonDir);

    // Parent of .git is the repo root
    return path.dirname(absoluteCommonDir);
  } catch {
    // Fallback to cwd if not in a git repo
    return cwd;
  }
}

/**
 * Generate ISO timestamp suitable for filenames.
 * 2026-01-11T09:00:00Z -> 2026-01-11T09-00-00Z
 */
function isoTimestampForFilename(): string {
  return new Date().toISOString().replace(/:/g, '-');
}

/**
 * Write a session event file atomically.
 * Creates events/ directory if needed.
 * All events go to a single central location - branch recorded in frontmatter.
 */
function writeSessionEvent(
  projectDir: string,
  sessionId: string,
  branch: string,
  reason: string
): boolean {
  try {
    // Get main repo root (handles worktrees)
    const repoRoot = getMainRepoRoot(projectDir);

    // Single central location for all events (always in main repo)
    const eventsDir = path.join(repoRoot, 'thoughts', 'shared', 'handoffs', 'events');

    // Ensure events directory exists
    if (!fs.existsSync(eventsDir)) {
      fs.mkdirSync(eventsDir, { recursive: true });
    }

    // Generate event filename: {ISO-timestamp}_{agent-id}.md
    const timestamp = isoTimestampForFilename();
    const agentId = sessionId.slice(0, 8);
    const eventFilename = `${timestamp}_${agentId}.md`;
    const eventPath = path.join(eventsDir, eventFilename);
    const tempPath = `${eventPath}.tmp`;

    // Current ISO timestamp for content
    const now = new Date().toISOString();

    // Build event content with YAML frontmatter
    const content = `---
ts: ${now}
agent: ${agentId}
branch: ${branch}
type: session_end
reason: ${reason}
---

## Session End
Updated: ${now}
`;

    // Atomic write: write to temp file, then rename
    fs.writeFileSync(tempPath, content, 'utf-8');
    fs.renameSync(tempPath, eventPath);

    return true;
  } catch {
    return false;
  }
}

async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => resolve(data));
  });
}

async function main() {
  try {
    const input: SessionEndInput = JSON.parse(await readStdin());
    const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

    // Detect git branch (for recording in event)
    const branch = getGitBranch(projectDir) || 'unknown';

    // Write session event file to central location
    const written = writeSessionEvent(projectDir, input.session_id, branch, input.reason);

    if (written) {
      console.error(`\n--- SESSION END ---\nEvent written to: thoughts/shared/handoffs/events/\n-------------------\n`);
    }
  } catch {
    // Don't block session end on errors
  }
  console.log(JSON.stringify({ result: 'continue' }));
}

void main();
