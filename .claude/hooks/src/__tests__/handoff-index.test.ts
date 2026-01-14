/**
 * Tests for handoff-index.ts functions
 *
 * Tests the updated extractSessionName function that supports both:
 * - New unified artifact format: YYYY-MM-DDTHH-MM-SS.sssZ_sessionid.md
 * - Legacy format: .../handoffs/<session-name>/...
 */

import { describe, it } from 'node:test';
import * as assert from 'node:assert';

/**
 * Extract session name from handoff file path.
 * For unified artifacts, extracts session_id from filename.
 * Filename format: YYYY-MM-DDTHH-MM-SS.sssZ_sessionid.md
 * For legacy artifacts, extracts from path: .../handoffs/<session-name>/...
 */
function extractSessionName(filePath: string): string | null {
  const filename = filePath.split(/[/\\]/).pop();
  if (filename) {
    // Try to extract session_id from unified filename format
    const match = filename.match(/_([0-9a-f]{8})\.md$/);
    if (match) {
      return match[1];
    }
  }

  // Fallback to legacy path-based extraction
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
  event_type?: 'checkpoint' | 'handoff' | 'finalize';
  schema_version?: string;
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
      if (key === 'event_type') {
        metadata.event_type = value as ArtifactFrontmatter['event_type'];
      } else if (key === 'schema_version') {
        metadata.schema_version = value;
      } else if (key === 'session_id') {
        metadata.session_id = value;
      }
    }
  }

  return metadata;
}

describe('extractSessionName', () => {
  it('should extract session_id from unified artifact filename', () => {
    const path = 'thoughts/shared/handoffs/events/2026-01-14T00-54-26.972Z_77ef540c.md';
    const result = extractSessionName(path);
    assert.strictEqual(result, '77ef540c');
  });

  it('should extract session_id from absolute unified path', () => {
    const path = '/Users/test/project/thoughts/shared/handoffs/events/2026-01-14T01-22-06.625Z_8c25a60a.md';
    const result = extractSessionName(path);
    assert.strictEqual(result, '8c25a60a');
  });

  it('should extract session_id from Windows unified path', () => {
    const path = 'C:\\project\\thoughts\\shared\\handoffs\\events\\2026-01-14T02-03-24.473Z_ec035b62.md';
    const result = extractSessionName(path);
    assert.strictEqual(result, 'ec035b62');
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
  it('should extract event_type from frontmatter', () => {
    const content = `---
schema_version: 1.0.0
event_type: checkpoint
session_id: 77ef540c
---

# Content here`;

    const result = extractFrontmatter(content);
    assert.strictEqual(result.event_type, 'checkpoint');
    assert.strictEqual(result.schema_version, '1.0.0');
    assert.strictEqual(result.session_id, '77ef540c');
  });

  it('should extract handoff event_type', () => {
    const content = `---
schema_version: 1.0.0
event_type: handoff
---`;

    const result = extractFrontmatter(content);
    assert.strictEqual(result.event_type, 'handoff');
  });

  it('should extract finalize event_type', () => {
    const content = `---
event_type: finalize
---`;

    const result = extractFrontmatter(content);
    assert.strictEqual(result.event_type, 'finalize');
  });

  it('should return empty object for content without frontmatter', () => {
    const content = 'Just plain content without frontmatter';
    const result = extractFrontmatter(content);
    assert.deepStrictEqual(result, {});
  });

  it('should handle frontmatter with extra fields', () => {
    const content = `---
schema_version: 1.0.0
event_type: checkpoint
timestamp: 2026-01-14T00:54:26.972Z
goal: Test the system
---`;

    const result = extractFrontmatter(content);
    assert.strictEqual(result.event_type, 'checkpoint');
    assert.strictEqual(result.schema_version, '1.0.0');
  });

  it('should ignore malformed lines in frontmatter', () => {
    const content = `---
event_type: handoff
invalid line without colon
schema_version: 1.0.0
---`;

    const result = extractFrontmatter(content);
    assert.strictEqual(result.event_type, 'handoff');
    assert.strictEqual(result.schema_version, '1.0.0');
  });
});
