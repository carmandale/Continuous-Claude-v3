#!/usr/bin/env python3
"""Backfill archival_memory project metadata from sessions.

Updates archival_memory.metadata.project for session_learning rows by joining
sessions.project on session_id. This enables per-project recall by default.

Usage:
  uv run python scripts/core/backfill_memory_project.py --dry-run
  uv run python scripts/core/backfill_memory_project.py --project "/path/to/project"
  uv run python scripts/core/backfill_memory_project.py
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
from typing import Any

from dotenv import load_dotenv


def load_env() -> None:
    """Load DATABASE_URL from global and local .env files."""
    global_env = Path.home() / ".claude" / ".env"
    if global_env.exists():
        load_dotenv(global_env)
    load_dotenv()


def get_db_url() -> str | None:
    """Resolve the postgres connection string."""
    return os.environ.get("DATABASE_URL") or os.environ.get("CONTINUOUS_CLAUDE_DB_URL")


def resolve_project(project: str | None) -> str | None:
    if not project:
        return None
    return str(Path(project).resolve())


def fetch_counts(cur: Any, project: str | None) -> tuple[int, list[tuple[str, int]]]:
    """Return total rows missing project and a top-10 breakdown by project."""
    if project:
        cur.execute(
            """
            SELECT COUNT(*)
            FROM archival_memory a
            JOIN sessions s ON a.session_id = s.id
            WHERE (a.metadata->>'project' IS NULL OR a.metadata->>'project' = '')
              AND a.metadata->>'type' = 'session_learning'
              AND s.project = %s
            """,
            (project,),
        )
        total = cur.fetchone()[0]
        return total, [(project, total)]

    cur.execute(
        """
        SELECT COUNT(*)
        FROM archival_memory a
        JOIN sessions s ON a.session_id = s.id
        WHERE (a.metadata->>'project' IS NULL OR a.metadata->>'project' = '')
          AND a.metadata->>'type' = 'session_learning'
          AND s.project IS NOT NULL
          AND s.project <> ''
        """
    )
    total = cur.fetchone()[0]

    cur.execute(
        """
        SELECT s.project, COUNT(*) AS cnt
        FROM archival_memory a
        JOIN sessions s ON a.session_id = s.id
        WHERE (a.metadata->>'project' IS NULL OR a.metadata->>'project' = '')
          AND a.metadata->>'type' = 'session_learning'
          AND s.project IS NOT NULL
          AND s.project <> ''
        GROUP BY s.project
        ORDER BY cnt DESC
        LIMIT 10
        """
    )
    breakdown = [(row[0], row[1]) for row in cur.fetchall()]
    return total, breakdown


def backfill(cur: Any, project: str | None) -> int:
    """Apply the backfill update and return number of rows updated."""
    if project:
        cur.execute(
            """
            UPDATE archival_memory a
            SET metadata = jsonb_set(COALESCE(a.metadata, '{}'::jsonb), '{project}', to_jsonb(s.project), true)
            FROM sessions s
            WHERE a.session_id = s.id
              AND (a.metadata->>'project' IS NULL OR a.metadata->>'project' = '')
              AND a.metadata->>'type' = 'session_learning'
              AND s.project = %s
            """,
            (project,),
        )
    else:
        cur.execute(
            """
            UPDATE archival_memory a
            SET metadata = jsonb_set(COALESCE(a.metadata, '{}'::jsonb), '{project}', to_jsonb(s.project), true)
            FROM sessions s
            WHERE a.session_id = s.id
              AND (a.metadata->>'project' IS NULL OR a.metadata->>'project' = '')
              AND a.metadata->>'type' = 'session_learning'
              AND s.project IS NOT NULL
              AND s.project <> ''
            """
        )

    return cur.rowcount


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Backfill archival_memory.metadata.project from sessions.project",
    )
    parser.add_argument(
        "--project",
        help="Only backfill rows for a specific project path",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show counts without updating",
    )

    args = parser.parse_args()
    load_env()
    db_url = get_db_url()
    if not db_url:
        print("DATABASE_URL/CONTINUOUS_CLAUDE_DB_URL not set.")
        return 1

    project = resolve_project(args.project)

    try:
        import psycopg2
    except ImportError as exc:
        print(f"psycopg2 is required: {exc}")
        return 1

    with psycopg2.connect(db_url) as conn:
        with conn.cursor() as cur:
            total, breakdown = fetch_counts(cur, project)
            scope_label = project or "ALL"
            print(f"Project scope: {scope_label}")
            print(f"Rows missing project: {total}")
            if breakdown:
                print("Top projects:")
                for name, count in breakdown:
                    print(f"  {name}: {count}")

            if args.dry_run:
                return 0

            updated = backfill(cur, project)
            conn.commit()
            print(f"Rows updated: {updated}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
