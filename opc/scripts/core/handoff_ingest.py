#!/usr/bin/env python3
"""Ingest a handoff artifact into the Postgres Coordination DB.

Intent
- Populate the `handoffs` table in the Coordination DB (continuous_claude)
- Minimal extraction: goal / worked / failed / decisions / outcome + full content
- Upsert keyed by file_path (idempotent)

This is designed to be called from the PostToolUse `handoff-index` hook.

Usage:
  cd opc
  uv run python scripts/core/handoff_ingest.py --file /abs/path/to/handoff.yaml --session-id s-abc123

Environment:
  - DATABASE_URL (preferred)
  - or CONTINUOUS_CLAUDE_DB_URL
  - or OPC_POSTGRES_URL
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv

# Load global ~/.claude/.env first, then local opc/.env (load_dotenv() loads cwd/.env)
global_env = Path.home() / ".claude" / ".env"
if global_env.exists():
    load_dotenv(global_env)
load_dotenv()


def get_postgres_url() -> str | None:
    return (
        os.environ.get("DATABASE_URL")
        or os.environ.get("CONTINUOUS_CLAUDE_DB_URL")
        or os.environ.get("OPC_POSTGRES_URL")
    )


_FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n(.*)$", re.DOTALL)
_VALID_OUTCOMES = {"SUCCEEDED", "PARTIAL_PLUS", "PARTIAL_MINUS", "FAILED"}


def split_frontmatter(content: str) -> tuple[dict[str, str], str]:
    """Split first YAML frontmatter block from remainder.

    Assumes format:
      ---
      key: value
      ---
      <body>
    """
    m = _FRONTMATTER_RE.match(content.replace("\r\n", "\n"))
    if not m:
        return {}, content

    raw_front = m.group(1)
    body = m.group(2)

    front: dict[str, str] = {}
    for line in raw_front.split("\n"):
        if ":" not in line:
            continue
        k, _, v = line.partition(":")
        front[k.strip()] = v.strip().strip('"\'')

    return front, body


_TOP_LEVEL_KEY_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*:\s*")


def extract_scalar(body: str, key: str) -> str | None:
    # Only match at column 0
    m = re.search(rf"^{re.escape(key)}:\s*(.+)$", body, flags=re.MULTILINE)
    return m.group(1).strip() if m else None


def extract_section_text(body: str, key: str) -> str | None:
    """Extract a top-level YAML section as raw text.

    Returns content *under* the key (not including the key line), until the next
    top-level key.

    Works for list sections like:
      worked:
        - foo
        - bar

    and for inline lists like:
      worked: [a, b]
    """
    lines = body.replace("\r\n", "\n").split("\n")
    start_idx = None
    inline = None

    for i, line in enumerate(lines):
        if line.startswith(f"{key}:"):
            start_idx = i
            inline = line[len(f"{key}:") :].strip()
            break

    if start_idx is None:
        return None

    # Inline value
    if inline:
        return inline

    # Multiline section
    out: list[str] = []
    for j in range(start_idx + 1, len(lines)):
        line = lines[j]
        if _TOP_LEVEL_KEY_RE.match(line):
            break
        out.append(line)

    text = "\n".join(out).strip("\n").strip()
    return text or None


def derive_session_name(file_path: str) -> str | None:
    parts = re.split(r"[\\/]", file_path)
    try:
        idx = parts.index("handoffs")
    except ValueError:
        return None
    if idx + 1 >= len(parts):
        return None
    return parts[idx + 1]


def upsert_handoff(
    *,
    pg_url: str,
    session_name: str,
    file_path: str,
    fmt: str,
    session_id: str | None,
    agent_id: str | None,
    root_span_id: str | None,
    goal: str | None,
    what_worked: str | None,
    what_failed: str | None,
    key_decisions: str | None,
    outcome: str | None,
    content: str,
) -> None:
    try:
        import psycopg2
    except ImportError as e:  # pragma: no cover
        raise RuntimeError("psycopg2 is required for Postgres ingestion") from e

    conn = psycopg2.connect(pg_url)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO handoffs (
                  session_name,
                  file_path,
                  format,
                  session_id,
                  agent_id,
                  root_span_id,
                  goal,
                  what_worked,
                  what_failed,
                  key_decisions,
                  outcome,
                  content,
                  indexed_at
                )
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,NOW())
                ON CONFLICT (file_path) DO UPDATE SET
                  session_name  = EXCLUDED.session_name,
                  format        = EXCLUDED.format,
                  session_id    = EXCLUDED.session_id,
                  agent_id      = EXCLUDED.agent_id,
                  root_span_id  = EXCLUDED.root_span_id,
                  goal          = EXCLUDED.goal,
                  what_worked   = EXCLUDED.what_worked,
                  what_failed   = EXCLUDED.what_failed,
                  key_decisions = EXCLUDED.key_decisions,
                  outcome       = EXCLUDED.outcome,
                  content       = EXCLUDED.content,
                  indexed_at    = NOW()
                """,
                (
                    session_name,
                    file_path,
                    fmt,
                    session_id,
                    agent_id,
                    root_span_id,
                    goal,
                    what_worked,
                    what_failed,
                    key_decisions,
                    outcome,
                    content,
                ),
            )
        conn.commit()
    finally:
        conn.close()


def main() -> int:
    ap = argparse.ArgumentParser(description="Ingest a handoff into Postgres handoffs table")
    ap.add_argument("--file", required=True, help="Path to handoff file (.yaml/.yml/.md)")
    ap.add_argument("--session-id", default=None, help="Coordination session id (optional)")
    ap.add_argument("--agent-id", default=None, help="Agent id (optional)")
    args = ap.parse_args()

    pg_url = get_postgres_url()
    if not pg_url:
        print("No DATABASE_URL/CONTINUOUS_CLAUDE_DB_URL/OPC_POSTGRES_URL set", file=sys.stderr)
        return 2

    file_path = str(Path(args.file).expanduser())
    p = Path(file_path)
    if not p.exists():
        print(f"File not found: {file_path}", file=sys.stderr)
        return 2

    content = p.read_text(encoding="utf-8")
    front, body = split_frontmatter(content)

    session_name = (
        front.get("session")
        or front.get("session_name")
        or front.get("session_id")
        or derive_session_name(file_path)
    )
    if not session_name:
        print("Could not determine session name", file=sys.stderr)
        return 2

    outcome = front.get("outcome") or front.get("status")
    if outcome:
        normalized = outcome.upper()
        outcome = normalized if normalized in _VALID_OUTCOMES else None
    root_span_id = front.get("root_span_id") or None

    goal = front.get("goal") or extract_scalar(body, "goal")

    # These are stored as raw section text (human-readable + searchable)
    what_worked = extract_section_text(body, "worked")
    what_failed = extract_section_text(body, "failed")

    key_decisions = extract_section_text(body, "final_decisions") or extract_section_text(body, "decisions")

    fmt = "yaml" if p.suffix in (".yaml", ".yml") else "md"

    upsert_handoff(
        pg_url=pg_url,
        session_name=session_name,
        file_path=str(p.resolve()),
        fmt=fmt,
        session_id=args.session_id or front.get("session_id"),
        agent_id=args.agent_id or front.get("agent_id"),
        root_span_id=root_span_id,
        goal=goal,
        what_worked=what_worked,
        what_failed=what_failed,
        key_decisions=key_decisions,
        outcome=outcome,
        content=content,
    )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
