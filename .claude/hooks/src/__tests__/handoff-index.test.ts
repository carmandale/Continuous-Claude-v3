/**
 * Tests for handoff-index.ts functions
 *
 * Tests the updated extractSessionName function that supports:
 * - Unified artifact path: thoughts/shared/handoffs/<session>/...
 * - Legacy format: .../handoffs/<session-name>/...
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert';

/**
 * Extract session name from handoff file path.
 * Unified artifacts live in thoughts/shared/handoffs/<session>/...
 * Legacy artifacts also used this path-based convention.
 */
function extractSessionName(filePath: string): string | null {
  const parts = filePath.split(/[/\\]/);
  const handoffsIdx = parts.findIndex(p => p === 'handoffs');
  if (handoffsIdx >= 0 && handoffsIdx < parts.length - 1) {
    return parts[handoffsIdx + 1];
  }
  return null;
}

/**
 * Extract frontmatter metadata from artifact content.
 */
interface ArtifactFrontmatter {
  mode?: 'checkpoint' | 'handoff' | 'finalize';
  schema_version?: string;
  session?: string;
  session_id?: string;
}

function extractFrontmatter(content: string): ArtifactFrontmatter {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatterMatch) {
    return {};
  }

  const frontmatterText = frontmatterMatch[1];
  const metadata: ArtifactFrontmatter = {};

  // Simple key-value parsing
  const lines = frontmatterText.split('\n');
  for (const line of lines) {
    const match = line.match(/^(\w+):\s*(.+)$/);
    if (match) {
      const [, key, value] = match;
      if (key === 'mode') {
        metadata.mode = value as ArtifactFrontmatter['mode'];
      } else if (key === 'schema_version') {
        metadata.schema_version = value;
      } else if (key === 'session') {
        metadata.session = value;
      } else if (key === 'session_id') {
        metadata.session_id = value;
      }
    }
  }

  return metadata;
}

describe('extractSessionName', () => {
  it('should extract session name from unified artifact path', () => {
    const path = 'thoughts/shared/handoffs/test-session/2026-01-14_00-54_checkpoint.yaml';
    const result = extractSessionName(path);
    assert.strictEqual(result, 'test-session');
  });

  it('should extract session name from absolute unified path', () => {
    const path = '/Users/test/project/thoughts/shared/handoffs/auth-refactor/2026-01-14_01-22_handoff.yaml';
    const result = extractSessionName(path);
    assert.strictEqual(result, 'auth-refactor');
  });

  it('should extract session name from Windows unified path', () => {
    const path = 'C:\\project\\thoughts\\shared\\handoffs\\bead-123-auth\\2026-01-14_02-03_handoff.yaml';
    const result = extractSessionName(path);
    assert.strictEqual(result, 'bead-123-auth');
  });

  it('should fallback to legacy session name extraction', () => {
    const path = 'thoughts/shared/handoffs/my-session/handoff-001.md';
    const result = extractSessionName(path);
    assert.strictEqual(result, 'my-session');
  });

  it('should handle nested legacy paths', () => {
    const path = '/home/user/project/thoughts/shared/handoffs/test-session/2024-01-01.md';
    const result = extractSessionName(path);
    assert.strictEqual(result, 'test-session');
  });

  it('should return null for non-handoff paths', () => {
    const path = '/project/thoughts/shared/other/file.md';
    const result = extractSessionName(path);
    assert.strictEqual(result, null);
  });

  it('should return null for paths with no session info', () => {
    const path = 'some-random-file.md';
    const result = extractSessionName(path);
    assert.strictEqual(result, null);
  });

  it('should handle handoffs at end of path (no session)', () => {
    const path = '/project/thoughts/shared/handoffs';
    const result = extractSessionName(path);
    assert.strictEqual(result, null);
  });
});

describe('extractFrontmatter', () => {
  it('should extract mode from frontmatter', () => {
    const content = `---
schema_version: 1.0.0
mode: checkpoint
session: test-session
session_id: 77ef540c
---

# Content here`;

    const result = extractFrontmatter(content);
    assert.strictEqual(result.mode, 'checkpoint');
    assert.strictEqual(result.schema_version, '1.0.0');
    assert.strictEqual(result.session, 'test-session');
    assert.strictEqual(result.session_id, '77ef540c');
  });

  it('should extract handoff mode', () => {
    const content = `---
schema_version: 1.0.0
mode: handoff
---`;

    const result = extractFrontmatter(content);
    assert.strictEqual(result.mode, 'handoff');
  });

  it('should extract finalize mode', () => {
    const content = `---
mode: finalize
---`;

    const result = extractFrontmatter(content);
    assert.strictEqual(result.mode, 'finalize');
  });

  it('should return empty object for content without frontmatter', () => {
    const content = 'Just plain content without frontmatter';
    const result = extractFrontmatter(content);
    assert.deepStrictEqual(result, {});
  });

  it('should handle frontmatter with extra fields', () => {
    const content = `---
schema_version: 1.0.0
mode: checkpoint
date: 2026-01-14T00:54:26.972Z
goal: Test the system
---`;

    const result = extractFrontmatter(content);
    assert.strictEqual(result.mode, 'checkpoint');
    assert.strictEqual(result.schema_version, '1.0.0');
  });

  it('should ignore malformed lines in frontmatter', () => {
    const content = `---
mode: handoff
invalid line without colon
schema_version: 1.0.0
---`;

    const result = extractFrontmatter(content);
    assert.strictEqual(result.mode, 'handoff');
    assert.strictEqual(result.schema_version, '1.0.0');
  });
});
