#!/usr/bin/env python3
"""Sweep unified artifacts into Postgres and optional SQLite index.

Usage:
  cd opc
  uv run python scripts/core/artifact_sweep.py --project /path/to/repo
  uv run python scripts/core/artifact_sweep.py --all-projects --migrate-legacy
  uv run python scripts/core/artifact_sweep.py --dry-run --json

Notes:
  - Ingests thoughts/shared/handoffs/**/*.{yaml,yml,md} into Postgres handoffs table
  - Optionally runs legacy migration (.checkpoint/.handoff -> unified artifacts)
  - Optionally keeps SQLite artifact index in sync for Markdown handoffs
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Iterable

from dotenv import load_dotenv


def load_env() -> None:
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
    m = re.search(rf"^{re.escape(key)}:\s*(.+)$", body, flags=re.MULTILINE)
    return m.group(1).strip() if m else None


def extract_section_text(body: str, key: str) -> str | None:
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

    if inline:
        return inline

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


def find_git_root(start: Path) -> Path:
    start = start.resolve()
    for parent in [start] + list(start.parents):
        if (parent / ".git").exists():
            return parent
    return start


def extract_project_from_jsonl(path: Path) -> str | None:
    try:
        with path.open("r", encoding="utf-8") as handle:
            for line in handle:
                if '"cwd"' not in line:
                    continue
                try:
                    payload = json.loads(line)
                except json.JSONDecodeError:
                    continue
                cwd = payload.get("cwd")
                if cwd:
                    return cwd
    except OSError:
        return None
    return None


def discover_projects() -> list[Path]:
    base = Path.home() / ".claude" / "projects"
    if not base.exists():
        return []
    projects: set[Path] = set()
    for project_dir in base.iterdir():
        if not project_dir.is_dir():
            continue
        for jsonl in project_dir.glob("*.jsonl"):
            cwd = extract_project_from_jsonl(jsonl)
            if cwd:
                projects.add(find_git_root(Path(cwd)))
                break
    return sorted(projects)


def iter_artifact_files(handoff_dir: Path) -> Iterable[Path]:
    for file_path in handoff_dir.rglob("*"):
        if not file_path.is_file():
            continue
        if file_path.suffix.lower() not in {".yaml", ".yml", ".md"}:
            continue
        yield file_path


def run_migration(project_root: Path, dry_run: bool) -> bool:
    hooks_dir = project_root / ".claude" / "hooks"
    if not hooks_dir.exists():
        return False
    script = "migrate:dry-run" if dry_run else "migrate"
    try:
        subprocess.run(
            ["npm", "run", "--silent", script],
            cwd=str(hooks_dir),
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        return True
    except subprocess.CalledProcessError as exc:
        sys.stderr.write(exc.stderr.decode("utf-8", errors="ignore"))
        return False


def upsert_handoff(cur, *, session_name: str, file_path: str, fmt: str,
                   session_id: str | None, agent_id: str | None, root_span_id: str | None,
                   goal: str | None, what_worked: str | None, what_failed: str | None,
                   key_decisions: str | None, outcome: str | None, content: str) -> None:
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


def ingest_file(file_path: Path, *, cur, dry_run: bool) -> tuple[bool, str | None]:
    content = file_path.read_text(encoding="utf-8")
    front, body = split_frontmatter(content)

    session_name = (
        front.get("session")
        or front.get("session_name")
        or front.get("session_id")
        or derive_session_name(str(file_path))
    )
    if not session_name:
        return False, "missing session"

    outcome = front.get("outcome") or front.get("status")
    if outcome:
        normalized = outcome.upper()
        outcome = normalized if normalized in _VALID_OUTCOMES else None
    root_span_id = front.get("root_span_id") or None
    agent_id = front.get("agent_id") or None
    session_id = front.get("session_id") or None

    goal = front.get("goal") or extract_scalar(body, "goal")
    what_worked = extract_section_text(body, "worked")
    what_failed = extract_section_text(body, "failed")
    key_decisions = extract_section_text(body, "final_decisions") or extract_section_text(body, "decisions")

    fmt = "yaml" if file_path.suffix.lower() in (".yaml", ".yml") else "md"

    if dry_run:
        return True, None

    upsert_handoff(
        cur,
        session_name=session_name,
        file_path=str(file_path.resolve()),
        fmt=fmt,
        session_id=session_id,
        agent_id=agent_id,
        root_span_id=root_span_id,
        goal=goal,
        what_worked=what_worked,
        what_failed=what_failed,
        key_decisions=key_decisions,
        outcome=outcome,
        content=content,
    )
    return True, None


def main() -> int:
    parser = argparse.ArgumentParser(description="Sweep unified artifacts into Postgres")
    parser.add_argument("--project", help="Project root to sweep (defaults to current repo)")
    parser.add_argument("--all-projects", action="store_true", help="Sweep all known projects")
    parser.add_argument("--migrate-legacy", action="store_true", help="Run legacy migration before sweep")
    parser.add_argument("--dry-run", action="store_true", help="Count artifacts without writing to DB")
    parser.add_argument("--verbose", action="store_true", help="Print each ingested file")
    parser.add_argument("--limit", type=int, default=0, help="Limit verbose output (0 = unlimited)")
    parser.add_argument("--json", action="store_true", help="Emit JSON summary")
    parser.add_argument("--no-sqlite", action="store_true", help="Skip SQLite index updates for .md")
    args = parser.parse_args()

    load_env()
    projects = discover_projects() if args.all_projects else []

    if not args.all_projects:
        root = Path(args.project) if args.project else Path.cwd()
        projects = [find_git_root(root)]

    pg_url = get_postgres_url()
    if not args.dry_run and not pg_url:
        print("No DATABASE_URL/CONTINUOUS_CLAUDE_DB_URL/OPC_POSTGRES_URL set", file=sys.stderr)
        return 2

    try:
        import psycopg2
    except ImportError as exc:
        if args.dry_run:
            psycopg2 = None  # type: ignore
        else:
            print(f"psycopg2 is required: {exc}", file=sys.stderr)
            return 2

    results: list[dict[str, object]] = []
    conn = psycopg2.connect(pg_url) if (not args.dry_run and pg_url) else None

    for project_root in projects:
        project_root = Path(project_root).resolve()
        handoff_dir = project_root / "thoughts" / "shared" / "handoffs"
        legacy_handoff = project_root / ".handoff"
        legacy_checkpoint = project_root / ".checkpoint"

        if args.migrate_legacy:
            run_migration(project_root, dry_run=args.dry_run)

        if not handoff_dir.exists():
            results.append(
                {
                    "project": str(project_root),
                    "status": "missing_handoffs_dir",
                    "files": 0,
                }
            )
            continue

        files = list(iter_artifact_files(handoff_dir))
        file_count = len(files)
        by_ext = {
            "yaml": sum(1 for f in files if f.suffix.lower() in (".yaml", ".yml")),
            "md": sum(1 for f in files if f.suffix.lower() == ".md"),
        }

        sqlite_conn = None
        if not args.no_sqlite:
            try:
                import artifact_index

                db_path = project_root / ".claude" / "cache" / "artifact-index" / "context.db"
                sqlite_conn = artifact_index.init_sqlite(db_path)
            except Exception:
                sqlite_conn = None

        ingested = 0
        errors: list[str] = []
        cur = conn.cursor() if conn else None

        for idx, file_path in enumerate(files, start=1):
            if args.verbose and (args.limit == 0 or idx <= args.limit):
                print(str(file_path))

            ok, err = ingest_file(file_path, cur=cur, dry_run=args.dry_run)
            if ok:
                ingested += 1
            else:
                errors.append(f"{file_path}: {err}")

            if sqlite_conn and file_path.suffix.lower() == ".md":
                try:
                    import artifact_index
                    artifact_index.index_single_file(sqlite_conn, file_path)
                except Exception:
                    pass

        if conn:
            conn.commit()

        if sqlite_conn:
            sqlite_conn.close()

        results.append(
            {
                "project": str(project_root),
                "files": file_count,
                "by_ext": by_ext,
                "ingested": ingested,
                "errors": errors,
                "legacy": {
                    "handoff": legacy_handoff.exists(),
                    "checkpoint": legacy_checkpoint.exists(),
                },
            }
        )

    if conn:
        conn.close()

    if args.json:
        print(json.dumps({"results": results}, indent=2))
    else:
        for row in results:
            print(f"Project: {row['project']}")
            if row.get("status") == "missing_handoffs_dir":
                print("  Missing: thoughts/shared/handoffs")
                continue
            print(f"  Files: {row['files']} (yaml: {row['by_ext']['yaml']}, md: {row['by_ext']['md']})")
            print(f"  Ingested: {row['ingested']}")
            legacy = row["legacy"]
            if legacy["handoff"] or legacy["checkpoint"]:
                print(f"  Legacy dirs: .handoff={legacy['handoff']} .checkpoint={legacy['checkpoint']}")
            if row["errors"]:
                print(f"  Errors: {len(row['errors'])}")
        if args.dry_run:
            print("Dry run only - no DB writes")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
