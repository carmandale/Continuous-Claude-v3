import * as fs from 'fs';
import * as path from 'path';

interface SessionStartInput {
  type?: 'startup' | 'resume' | 'clear' | 'compact';
  source?: 'startup' | 'resume' | 'clear' | 'compact';
  session_id: string;
}

/**
 * Extract the Ledger section from handoff content.
 * Matches from "## Ledger" to "---" separator or next "## " heading.
 * Tolerates CRLF line endings and minor whitespace variance.
 */
export function extractLedgerSection(content: string): string | null {
  // Normalize line endings to LF
  const normalized = content.replace(/\r\n/g, '\n');
  const match = normalized.match(/(?:^|\n)##\s*Ledger\s*\n([\s\S]*?)(?=\n---\n|\n## [^#]|$)/);
  return match ? `## Ledger\n${match[1].trim()}` : null;
}

/**
 * Find the most recent .md file in a session's handoff directory.
 * If requireLedger is true, finds the most recent file that contains a Ledger section.
 */
export function findSessionHandoff(sessionName: string, requireLedger = false): string | null {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const handoffDir = path.join(projectDir, 'thoughts', 'shared', 'handoffs', sessionName);

  try {
    if (!fs.existsSync(handoffDir) || !fs.statSync(handoffDir).isDirectory()) return null;

    const mdFiles = fs.readdirSync(handoffDir)
      .filter(f => f.endsWith('.md'))
      .map(f => {
        try {
          return { name: f, mtime: fs.statSync(path.join(handoffDir, f)).mtime.getTime() };
        } catch {
          return null;
        }
      })
      .filter((f): f is { name: string; mtime: number } => f !== null)
      .sort((a, b) => b.mtime - a.mtime);

    if (!requireLedger) {
      return mdFiles.length > 0 ? path.join(handoffDir, mdFiles[0].name) : null;
    }

    // Scan newest→oldest to find first file with a Ledger section
    for (const file of mdFiles) {
      const filePath = path.join(handoffDir, file.name);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        if (extractLedgerSection(content)) {
          return filePath;
        }
      } catch {
        continue;
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Find most recent handoff with a Ledger section across all sessions.
 */
function findMostRecentLedger(handoffsDir: string): { content: string; session: string; path: string } | null {
  try {
    if (!fs.existsSync(handoffsDir) || !fs.statSync(handoffsDir).isDirectory()) return null;

    const entries = fs.readdirSync(handoffsDir, { withFileTypes: true });
    const sessions = entries.filter(d => d.isDirectory()).map(d => d.name);

    let best: { content: string; session: string; path: string; mtime: number } | null = null;

    for (const session of sessions) {
      // Find the most recent file WITH a ledger in this session
      const handoffPath = findSessionHandoff(session, true);
      if (!handoffPath) continue;

      try {
        const content = fs.readFileSync(handoffPath, 'utf-8');
        const ledger = extractLedgerSection(content);
        if (!ledger) continue;

        const mtime = fs.statSync(handoffPath).mtime.getTime();
        if (!best || mtime > best.mtime) {
          best = { content: ledger, session, path: handoffPath, mtime };
        }
      } catch {
        continue;
      }
    }

    return best ? { content: best.content, session: best.session, path: best.path } : null;
  } catch {
    return null;
  }
}

async function main() {
  let output: Record<string, unknown> = { result: 'continue' };

  try {
    const raw = await readStdin();
    const input: SessionStartInput = JSON.parse(raw);
    const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const sessionType = input.source || input.type;
    const handoffsDir = path.join(projectDir, 'thoughts', 'shared', 'handoffs');

    const ledger = findMostRecentLedger(handoffsDir);

    if (ledger) {
      const goalMatch = ledger.content.match(/\*\*Goal:\*\*\s*([^\n]+)/);
      // Match "### Now" followed by optional checkbox/arrow markers
      const nowMatch = ledger.content.match(/### Now\s*\n[-\s\[\]>x]*([^\n]+)/i);
      const goal = goalMatch ? goalMatch[1].trim().substring(0, 100) : 'No goal';
      const now = nowMatch ? nowMatch[1].trim() : 'Unknown';

      const message = `Continuity: ${ledger.session}\n   Goal: ${goal}\n   Now: ${now}`;
      console.error(`Continuity loaded: ${ledger.session}`);

      output = { result: 'continue', message };

      if (sessionType === 'clear' || sessionType === 'compact') {
        output.hookSpecificOutput = {
          hookEventName: 'SessionStart',
          additionalContext: `Ledger from ${path.basename(ledger.path)}:\n\n${ledger.content}`
        };
      }
    }
  } catch (err) {
    console.error('session-start-continuity error:', err);
    // Keep output = {result:'continue'} - fail open
  }

  process.stdout.write(JSON.stringify(output));
}

async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => resolve(data));
  });
}

void main();
