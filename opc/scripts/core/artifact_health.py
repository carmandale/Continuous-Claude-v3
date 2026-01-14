#!/usr/bin/env python3
"""Artifact health dashboard for unified artifacts.

Usage:
  cd opc
  uv run python scripts/core/artifact_health.py --project /path/to/repo
  uv run python scripts/core/artifact_health.py --all-projects
  uv run python scripts/core/artifact_health.py --all-projects --json
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv

_FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n(.*)$", re.DOTALL)


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


def iter_artifact_files(handoff_dir: Path) -> list[Path]:
    files: list[Path] = []
    for file_path in handoff_dir.rglob("*"):
        if not file_path.is_file():
            continue
        if file_path.suffix.lower() not in {".yaml", ".yml", ".md"}:
            continue
        files.append(file_path)
    return files


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


def derive_session_name(file_path: Path, handoff_dir: Path) -> str | None:
    try:
        parts = file_path.relative_to(handoff_dir).parts
    except ValueError:
        return None
    if not parts:
        return None
    if len(parts) == 1:
        return parts[0]
    return parts[0]


def extract_session_name(file_path: Path, handoff_dir: Path) -> str | None:
    try:
        content = file_path.read_text(encoding="utf-8")
    except OSError:
        return derive_session_name(file_path, handoff_dir)
    front, _ = split_frontmatter(content)
    return (
        front.get("session")
        or front.get("session_name")
        or front.get("session_id")
        or derive_session_name(file_path, handoff_dir)
    )


def count_files(path: Path) -> int:
    if not path.exists():
        return 0
    return sum(1 for p in path.rglob("*") if p.is_file())


def main() -> int:
    parser = argparse.ArgumentParser(description="Artifact health dashboard")
    parser.add_argument("--project", help="Project root to check (defaults to current repo)")
    parser.add_argument("--all-projects", action="store_true", help="Check all known projects")
    parser.add_argument("--json", action="store_true", help="Emit JSON output")
    parser.add_argument("--include-files", action="store_true", help="Include missing/stale file lists")
    parser.add_argument("--limit", type=int, default=25, help="Max items to list for missing/stale")
    args = parser.parse_args()

    load_env()
    projects = discover_projects() if args.all_projects else []

    if not args.all_projects:
        root = Path(args.project) if args.project else Path.cwd()
        projects = [find_git_root(root)]

    db_url = get_postgres_url()
    conn = None
    cur = None

    if db_url:
        try:
            import psycopg2
            conn = psycopg2.connect(db_url)
            cur = conn.cursor()
        except Exception as exc:
            print(f"Postgres unavailable: {exc}", file=sys.stderr)
            conn = None
            cur = None

    results: list[dict[str, object]] = []

    for project_root in projects:
        project_root = Path(project_root).resolve()
        handoff_dir = project_root / "thoughts" / "shared" / "handoffs"
        legacy_handoff = project_root / ".handoff"
        legacy_checkpoint = project_root / ".checkpoint"

        files = iter_artifact_files(handoff_dir) if handoff_dir.exists() else []
        disk_paths = {str(p.resolve()) for p in files}
        disk_sessions = {
            extract_session_name(p, handoff_dir) for p in files if handoff_dir.exists()
        }
        disk_sessions.discard(None)

        by_ext = {
            "yaml": sum(1 for p in files if p.suffix.lower() in (".yaml", ".yml")),
            "md": sum(1 for p in files if p.suffix.lower() == ".md"),
        }

        db_paths: set[str] = set()
        db_sessions: set[str] = set()
        agent_counts: dict[str, int] = {}

        if cur and handoff_dir.exists():
            prefix = str(handoff_dir.resolve()) + os.sep
            cur.execute(
                "SELECT file_path, session_name, agent_id FROM handoffs WHERE file_path LIKE %s",
                (prefix + "%",),
            )
            rows = cur.fetchall()
            db_paths = {row[0] for row in rows}
            for _, session_name, agent_id in rows:
                if session_name:
                    db_sessions.add(session_name)
                key = agent_id if agent_id else "unknown"
                agent_counts[key] = agent_counts.get(key, 0) + 1

        missing_files = sorted(disk_paths - db_paths)
        stale_files = sorted(db_paths - disk_paths)
        missing_sessions = sorted(disk_sessions - db_sessions)
        stale_sessions = sorted(db_sessions - disk_sessions)

        results.append(
            {
                "project": str(project_root),
                "disk": {
                    "files": len(files),
                    "by_ext": by_ext,
                    "sessions": len(disk_sessions),
                    "legacy": {
                        "handoff": count_files(legacy_handoff),
                        "checkpoint": count_files(legacy_checkpoint),
                    },
                },
                "db": {
                    "rows": len(db_paths),
                    "sessions": len(db_sessions),
                    "agents": agent_counts,
                    "unknown_agents": agent_counts.get("unknown", 0),
                },
                "diff": {
                    "missing_files": missing_files[: args.limit] if args.include_files else [],
                    "missing_files_count": len(missing_files),
                    "stale_files": stale_files[: args.limit] if args.include_files else [],
                    "stale_files_count": len(stale_files),
                    "missing_sessions": missing_sessions[: args.limit] if args.include_files else [],
                    "missing_sessions_count": len(missing_sessions),
                    "stale_sessions": stale_sessions[: args.limit] if args.include_files else [],
                    "stale_sessions_count": len(stale_sessions),
                },
            }
        )

    if conn:
        conn.close()

    if args.json:
        print(json.dumps({"results": results}, indent=2))
    else:
        for row in results:
            disk = row["disk"]
            db = row["db"]
            diff = row["diff"]
            print(f"Project: {row['project']}")
            print(
                f"  Disk: {disk['files']} (yaml: {disk['by_ext']['yaml']}, md: {disk['by_ext']['md']})"
            )
            print(f"  Disk sessions: {disk['sessions']}")
            print(
                f"  Legacy files: .handoff={disk['legacy']['handoff']} .checkpoint={disk['legacy']['checkpoint']}"
            )
            print(f"  DB rows: {db['rows']}")
            print(f"  DB sessions: {db['sessions']}")
            print(f"  DB agents: {len(db['agents'])} (unknown: {db['unknown_agents']})")
            print(
                f"  Missing files: {diff['missing_files_count']} | Stale files: {diff['stale_files_count']}"
            )
            print(
                f"  Missing sessions: {diff['missing_sessions_count']} | Stale sessions: {diff['stale_sessions_count']}"
            )
            if args.include_files and diff["missing_files"]:
                print("  Missing files (sample):")
                for item in diff["missing_files"]:
                    print(f"    - {item}")
            if args.include_files and diff["stale_files"]:
                print("  Stale files (sample):")
                for item in diff["stale_files"]:
                    print(f"    - {item}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
