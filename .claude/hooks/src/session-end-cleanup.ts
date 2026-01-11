import * as fs from 'fs';
import * as path from 'path';

interface SessionEndInput {
  session_id: string;
  transcript_path: string;
  reason: 'clear' | 'logout' | 'prompt_input_exit' | 'other';
}

/**
 * Update the timestamp in the most recent continuity ledger.
 */
function updateLedgerTimestamp(projectDir: string): boolean {
  try {
    const ledgerDir = path.join(projectDir, 'thoughts', 'ledgers');
    if (!fs.existsSync(ledgerDir) || !fs.statSync(ledgerDir).isDirectory()) return false;

    const ledgerFiles = fs.readdirSync(ledgerDir)
      .filter(f => f.startsWith('CONTINUITY_CLAUDE-') && f.endsWith('.md'))
      .map(f => {
        try {
          return { name: f, mtime: fs.statSync(path.join(ledgerDir, f)).mtime.getTime() };
        } catch {
          return null;
        }
      })
      .filter((f): f is { name: string; mtime: number } => f !== null)
      .sort((a, b) => b.mtime - a.mtime);

    if (ledgerFiles.length === 0) return false;

    const ledgerPath = path.join(ledgerDir, ledgerFiles[0].name);
    let content = fs.readFileSync(ledgerPath, 'utf-8');
    const newContent = content.replace(/^Updated:\s.*$/m, `Updated: ${new Date().toISOString()}`);

    // Only write if we actually made a change
    if (newContent === content) return false;

    fs.writeFileSync(ledgerPath, newContent);
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

    const updated = updateLedgerTimestamp(projectDir);
    if (updated) {
      console.error('\n--- SESSION END ---\nLedger updated\n-------------------\n');
    }
  } catch {
    // Don't block session end on errors
  }
  console.log(JSON.stringify({ result: 'continue' }));
}

void main();
