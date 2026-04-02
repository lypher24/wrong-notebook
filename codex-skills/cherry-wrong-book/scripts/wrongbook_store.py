from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sqlite3
import sys
import unicodedata
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

STORE_ROOT = Path("data") / "codex-wrong-book"
DB_NAME = "wrongbook.sqlite"

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

SUBJECT_ALIASES: dict[str, tuple[str, str]] = {
    "数学": ("math", "数学"),
    "math": ("math", "数学"),
    "物理": ("physics", "物理"),
    "physics": ("physics", "物理"),
    "化学": ("chemistry", "化学"),
    "chemistry": ("chemistry", "化学"),
    "生物": ("biology", "生物"),
    "biology": ("biology", "生物"),
    "英语": ("english", "英语"),
    "english": ("english", "英语"),
    "语文": ("chinese", "语文"),
    "chinese": ("chinese", "语文"),
    "历史": ("history", "历史"),
    "history": ("history", "历史"),
    "地理": ("geography", "地理"),
    "geography": ("geography", "地理"),
    "政治": ("politics", "政治"),
    "politics": ("politics", "政治"),
    "其他": ("other", "其他"),
    "other": ("other", "其他"),
}

PUNCTUATION_TO_STRIP = set(" \t\r\n，。！？；：,.!?;:、（）()[]【】{}<>《》“”\"'`")


def utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def isoformat(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).replace(microsecond=0).isoformat()


def json_dump(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))


def print_json(data: Any) -> None:
    print(json_dump(data))


def resolve_workspace_root(raw: str | None) -> Path:
    base = raw or os.getcwd()
    return Path(base).expanduser().resolve()


def store_paths(workspace_root: Path) -> tuple[Path, Path, Path]:
    base_dir = workspace_root / STORE_ROOT
    db_path = base_dir / DB_NAME
    images_dir = base_dir / "images"
    return base_dir, db_path, images_dir


def ensure_dirs(base_dir: Path, images_dir: Path) -> None:
    base_dir.mkdir(parents=True, exist_ok=True)
    images_dir.mkdir(parents=True, exist_ok=True)


def connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS wrong_entries (
            id TEXT PRIMARY KEY,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            question_hash TEXT NOT NULL,
            subject_key TEXT NOT NULL,
            subject_label TEXT NOT NULL,
            requires_image INTEGER NOT NULL DEFAULT 0,
            question_text TEXT NOT NULL,
            answer_text TEXT NOT NULL,
            analysis_text TEXT NOT NULL,
            tags_json TEXT NOT NULL,
            source_type TEXT NOT NULL,
            image_path TEXT,
            input_json TEXT NOT NULL,
            draft_json TEXT NOT NULL,
            final_json TEXT NOT NULL,
            meta_json TEXT NOT NULL,
            notes TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_wrong_entries_question_hash
        ON wrong_entries(question_hash);

        CREATE INDEX IF NOT EXISTS idx_wrong_entries_created_at
        ON wrong_entries(created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_wrong_entries_subject_key
        ON wrong_entries(subject_key, created_at DESC);
        """
    )
    conn.commit()


def normalize_subject(raw_subject: Any) -> tuple[str, str]:
    original = str(raw_subject or "").strip()
    lowered = original.lower()
    if lowered in SUBJECT_ALIASES:
        return SUBJECT_ALIASES[lowered]
    if original in SUBJECT_ALIASES:
        return SUBJECT_ALIASES[original]
    return SUBJECT_ALIASES["other"]


def ensure_text(value: Any, field_name: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise ValueError(f"{field_name} 不能为空")
    return text


def normalize_tags(raw_tags: Any) -> list[str]:
    if raw_tags is None:
        return []
    if isinstance(raw_tags, str):
        parts = [part.strip() for part in raw_tags.replace("，", ",").split(",")]
    elif isinstance(raw_tags, list):
        parts = [str(item).strip() for item in raw_tags]
    else:
        raise ValueError("tags 必须是数组或逗号分隔字符串")

    deduped: list[str] = []
    seen: set[str] = set()
    for part in parts:
        if not part or part in seen:
            continue
        deduped.append(part)
        seen.add(part)
        if len(deduped) >= 5:
            break
    return deduped


def normalize_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "y", "是"}


def normalize_question_for_hash(question_text: str) -> str:
    normalized = unicodedata.normalize("NFKC", question_text).lower()
    kept: list[str] = []
    for char in normalized:
        if char in PUNCTUATION_TO_STRIP:
            continue
        kept.append(char)
    return "".join(kept)


def question_hash(question_text: str) -> str:
    normalized = normalize_question_for_hash(question_text)
    if not normalized:
        normalized = question_text.strip().lower()
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def normalize_section(section: Any, section_name: str) -> dict[str, Any]:
    if section is None:
        raise ValueError(f"{section_name} 缺失")
    if not isinstance(section, dict):
        raise ValueError(f"{section_name} 必须是对象")

    subject_key, subject_label = normalize_subject(section.get("subject"))

    return {
        "subject_key": subject_key,
        "subject_label": subject_label,
        "question_text": ensure_text(section.get("question_text"), f"{section_name}.question_text"),
        "answer_text": ensure_text(section.get("answer_text"), f"{section_name}.answer_text"),
        "analysis": ensure_text(section.get("analysis"), f"{section_name}.analysis"),
        "tags": normalize_tags(section.get("tags")),
        "requires_image": normalize_bool(section.get("requires_image")),
    }


def normalize_payload(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("payload 必须是 JSON 对象")

    input_block = payload.get("input") if isinstance(payload.get("input"), dict) else {}
    meta_block = payload.get("meta") if isinstance(payload.get("meta"), dict) else {}

    draft_raw = payload.get("draft") or payload.get("final")
    final_raw = payload.get("final") or payload.get("draft")
    if draft_raw is None or final_raw is None:
        raise ValueError("payload 至少要包含 draft 或 final")

    return {
        "input": {
            "source_type": str(input_block.get("source_type") or "").strip() or "chat_text",
            "raw_text": str(input_block.get("raw_text") or "").strip(),
            "image_source_path": str(input_block.get("image_source_path") or "").strip() or None,
        },
        "draft": normalize_section(draft_raw, "draft"),
        "final": normalize_section(final_raw, "final"),
        "notes": str(payload.get("notes") or "").strip() or None,
        "meta": meta_block,
    }


def resolve_source_image(image_source_path: str | None, workspace_root: Path) -> Path | None:
    if not image_source_path:
        return None

    candidate = Path(image_source_path).expanduser()
    if not candidate.is_absolute():
        candidate = (workspace_root / candidate).resolve()

    if not candidate.exists() or not candidate.is_file():
        raise FileNotFoundError(f"找不到图片文件: {candidate}")

    return candidate


def archive_image(
    source_image: Path | None,
    workspace_root: Path,
    images_dir: Path,
    new_entry_id: str,
) -> str | None:
    if source_image is None:
        return None

    month_dir = images_dir / utc_now().strftime("%Y-%m")
    month_dir.mkdir(parents=True, exist_ok=True)
    suffix = source_image.suffix.lower() or ".bin"
    target = month_dir / f"{new_entry_id}{suffix}"
    shutil.copy2(source_image, target)
    return str(target.relative_to(workspace_root))


def parse_json_file(payload_file: str | None) -> Any:
    if payload_file:
        return json.loads(Path(payload_file).read_text(encoding="utf-8"))
    if sys.stdin.isatty():
        raise ValueError("缺少 payload-file，且没有从 stdin 读取到 JSON")
    return json.loads(sys.stdin.read())


def generate_entry_id() -> str:
    return f"wb_{utc_now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"


def row_to_entry(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "question_hash": row["question_hash"],
        "subject_key": row["subject_key"],
        "subject_label": row["subject_label"],
        "requires_image": bool(row["requires_image"]),
        "question_text": row["question_text"],
        "answer_text": row["answer_text"],
        "analysis_text": row["analysis_text"],
        "tags": json.loads(row["tags_json"]),
        "source_type": row["source_type"],
        "image_path": row["image_path"],
        "input": json.loads(row["input_json"]),
        "draft": json.loads(row["draft_json"]),
        "final": json.loads(row["final_json"]),
        "meta": json.loads(row["meta_json"]),
        "notes": row["notes"],
    }


def summarize_entry(entry: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": entry["id"],
        "created_at": entry["created_at"],
        "subject_key": entry["subject_key"],
        "subject_label": entry["subject_label"],
        "tags": entry["tags"],
        "question_preview": entry["question_text"][:80],
        "image_path": entry["image_path"],
    }


def find_duplicate(conn: sqlite3.Connection, computed_hash: str, cutoff: datetime) -> sqlite3.Row | None:
    return conn.execute(
        """
        SELECT *
        FROM wrong_entries
        WHERE question_hash = ? AND created_at >= ?
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (computed_hash, isoformat(cutoff)),
    ).fetchone()


def command_init(args: argparse.Namespace) -> int:
    workspace_root = resolve_workspace_root(args.workspace_root)
    base_dir, db_path, images_dir = store_paths(workspace_root)
    ensure_dirs(base_dir, images_dir)
    conn = connect(db_path)
    try:
        ensure_schema(conn)
    finally:
        conn.close()

    print_json(
        {
            "status": "initialized",
            "workspace_root": str(workspace_root),
            "database_path": str(db_path.relative_to(workspace_root)),
            "images_path": str(images_dir.relative_to(workspace_root)),
        }
    )
    return 0


def command_save(args: argparse.Namespace) -> int:
    workspace_root = resolve_workspace_root(args.workspace_root)
    base_dir, db_path, images_dir = store_paths(workspace_root)
    ensure_dirs(base_dir, images_dir)
    conn = connect(db_path)
    try:
        ensure_schema(conn)
        payload = normalize_payload(parse_json_file(args.payload_file))
        final_section = payload["final"]
        draft_section = payload["draft"]
        computed_hash = question_hash(final_section["question_text"])
        now = utc_now()

        if not args.allow_duplicate:
            duplicate = find_duplicate(
                conn,
                computed_hash,
                now - timedelta(hours=args.duplicate_window_hours),
            )
            if duplicate is not None:
                print_json(
                    {
                        "status": "duplicate",
                        "message": "发现最近的相同题目记录",
                        "existing": summarize_entry(row_to_entry(duplicate)),
                        "database_path": str(db_path.relative_to(workspace_root)),
                    }
                )
                return 20

        new_entry_id = generate_entry_id()
        source_image = resolve_source_image(payload["input"]["image_source_path"], workspace_root)
        archived_image_path = archive_image(source_image, workspace_root, images_dir, new_entry_id)

        input_json = {
            "source_type": payload["input"]["source_type"],
            "raw_text": payload["input"]["raw_text"],
            "image_source_path": payload["input"]["image_source_path"],
        }
        meta_json = {**payload["meta"], "image_archived": bool(archived_image_path)}

        conn.execute(
            """
            INSERT INTO wrong_entries (
                id, created_at, updated_at, question_hash,
                subject_key, subject_label, requires_image,
                question_text, answer_text, analysis_text, tags_json,
                source_type, image_path, input_json, draft_json,
                final_json, meta_json, notes
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
            """,
            (
                new_entry_id,
                isoformat(now),
                isoformat(now),
                computed_hash,
                final_section["subject_key"],
                final_section["subject_label"],
                1 if final_section["requires_image"] else 0,
                final_section["question_text"],
                final_section["answer_text"],
                final_section["analysis"],
                json_dump(final_section["tags"]),
                payload["input"]["source_type"],
                archived_image_path,
                json_dump(input_json),
                json_dump(draft_section),
                json_dump(final_section),
                json_dump(meta_json),
                payload["notes"],
            ),
        )
        conn.commit()

        print_json(
            {
                "status": "saved",
                "entry": {
                    "id": new_entry_id,
                    "created_at": isoformat(now),
                    "subject_key": final_section["subject_key"],
                    "subject_label": final_section["subject_label"],
                    "tags": final_section["tags"],
                    "image_path": archived_image_path,
                    "requires_image": final_section["requires_image"],
                },
                "database_path": str(db_path.relative_to(workspace_root)),
            }
        )
        return 0
    finally:
        conn.close()


def command_get(args: argparse.Namespace) -> int:
    workspace_root = resolve_workspace_root(args.workspace_root)
    _, db_path, _ = store_paths(workspace_root)
    if not db_path.exists():
        raise FileNotFoundError(f"数据库不存在: {db_path}")

    conn = connect(db_path)
    try:
        ensure_schema(conn)
        row = conn.execute("SELECT * FROM wrong_entries WHERE id = ?", (args.id,)).fetchone()
        if row is None:
            print_json({"status": "not_found", "id": args.id})
            return 4
        print_json({"status": "ok", "entry": row_to_entry(row)})
        return 0
    finally:
        conn.close()


def command_list(args: argparse.Namespace) -> int:
    workspace_root = resolve_workspace_root(args.workspace_root)
    _, db_path, _ = store_paths(workspace_root)
    if not db_path.exists():
        print_json({"status": "ok", "entries": []})
        return 0

    conn = connect(db_path)
    try:
        ensure_schema(conn)
        clauses: list[str] = []
        values: list[Any] = []

        if args.subject:
            subject_key, _ = normalize_subject(args.subject)
            clauses.append("subject_key = ?")
            values.append(subject_key)

        query = "SELECT * FROM wrong_entries"
        if clauses:
            query += " WHERE " + " AND ".join(clauses)
        query += " ORDER BY created_at DESC LIMIT ?"
        values.append(args.limit)

        rows = conn.execute(query, values).fetchall()
        entries = [row_to_entry(row) for row in rows]
        if args.tag:
            entries = [entry for entry in entries if args.tag in entry["tags"]]

        payload_entries = [summarize_entry(entry) for entry in entries] if args.summary else entries
        print_json({"status": "ok", "entries": payload_entries})
        return 0
    finally:
        conn.close()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Cherry Wrong Book local store")
    subparsers = parser.add_subparsers(dest="command", required=True)

    init_parser = subparsers.add_parser("init", help="Initialize store")
    init_parser.add_argument("--workspace-root", default=None)
    init_parser.set_defaults(func=command_init)

    save_parser = subparsers.add_parser("save", help="Save confirmed wrong entry")
    save_parser.add_argument("--workspace-root", default=None)
    save_parser.add_argument("--payload-file", default=None)
    save_parser.add_argument("--allow-duplicate", action="store_true")
    save_parser.add_argument("--duplicate-window-hours", type=float, default=12.0)
    save_parser.set_defaults(func=command_save)

    get_parser = subparsers.add_parser("get", help="Get a single entry")
    get_parser.add_argument("--workspace-root", default=None)
    get_parser.add_argument("--id", required=True)
    get_parser.set_defaults(func=command_get)

    list_parser = subparsers.add_parser("list", help="List recent entries")
    list_parser.add_argument("--workspace-root", default=None)
    list_parser.add_argument("--limit", type=int, default=20)
    list_parser.add_argument("--subject", default=None)
    list_parser.add_argument("--tag", default=None)
    list_parser.add_argument("--summary", action="store_true")
    list_parser.set_defaults(func=command_list)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    try:
        return int(args.func(args))
    except Exception as exc:  # noqa: BLE001
        print_json({"status": "error", "message": str(exc)})
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
