"""
session_store.py — SQLite-backed persistence for RoomScan AI projects.

This is a drop-in replacement for the old in-memory `sessions = {}` dict.
It supports the exact same access patterns already used throughout app.py:

    sessions[session_id]                  -> read (raises KeyError if missing)
    sessions[session_id] = {...}          -> write / overwrite
    session_id in sessions                -> membership check
    del sessions[session_id]              -> delete
    sessions.items()                      -> iterate (used by cleanup)
    len(sessions)                         -> count (used by /health)
    sessions.get(session_id, default)     -> safe read

Because this preserves the dict-like interface, no other function in app.py
needs to change its logic — only the two lines that create/import `sessions`.

Data survives a server restart because it's written to a local SQLite file
(`roomscan.db` by default, created next to app.py).
"""

import json
import sqlite3
import threading
from datetime import datetime
from typing import Any, Dict, Iterator, Optional, Tuple

DEFAULT_DB_PATH = "roomscan.db"


class _JSONEncoder(json.JSONEncoder):
    """Allows datetime objects (used for `created_at`) to round-trip through JSON."""

    def default(self, obj):
        if isinstance(obj, datetime):
            return {"__datetime__": obj.isoformat()}
        return super().default(obj)


def _json_object_hook(d):
    if "__datetime__" in d:
        return datetime.fromisoformat(d["__datetime__"])
    return d


class SQLiteSessionStore:
    """Dict-like wrapper around a single SQLite table of JSON blobs."""

    def __init__(self, db_path: str = DEFAULT_DB_PATH):
        self.db_path = db_path
        self._lock = threading.Lock()
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.execute("PRAGMA journal_mode=WAL")
        return conn

    def _init_db(self) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS projects (
                    id TEXT PRIMARY KEY,
                    data TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            conn.commit()

    # -- dict-like protocol -------------------------------------------------

    def __contains__(self, key: str) -> bool:
        with self._lock, self._connect() as conn:
            row = conn.execute("SELECT 1 FROM projects WHERE id = ?", (key,)).fetchone()
            return row is not None

    def __getitem__(self, key: str) -> Dict[str, Any]:
        with self._lock, self._connect() as conn:
            row = conn.execute("SELECT data FROM projects WHERE id = ?", (key,)).fetchone()
            if row is None:
                raise KeyError(key)
            return json.loads(row[0], object_hook=_json_object_hook)

    def __setitem__(self, key: str, value: Dict[str, Any]) -> None:
        now = datetime.now().isoformat()
        payload = json.dumps(value, cls=_JSONEncoder)
        with self._lock, self._connect() as conn:
            existing = conn.execute(
                "SELECT created_at FROM projects WHERE id = ?", (key,)
            ).fetchone()
            created_at = existing[0] if existing else now
            conn.execute(
                """
                INSERT INTO projects (id, data, created_at, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
                """,
                (key, payload, created_at, now),
            )
            conn.commit()

    def __delitem__(self, key: str) -> None:
        with self._lock, self._connect() as conn:
            conn.execute("DELETE FROM projects WHERE id = ?", (key,))
            conn.commit()

    def __len__(self) -> int:
        with self._lock, self._connect() as conn:
            row = conn.execute("SELECT COUNT(*) FROM projects").fetchone()
            return row[0] if row else 0

    # -- convenience helpers -------------------------------------------------

    def get(self, key: str, default: Optional[Dict[str, Any]] = None):
        try:
            return self[key]
        except KeyError:
            return default

    def items(self) -> Iterator[Tuple[str, Dict[str, Any]]]:
        with self._lock, self._connect() as conn:
            rows = conn.execute("SELECT id, data FROM projects").fetchall()
        for row_id, data in rows:
            yield row_id, json.loads(data, object_hook=_json_object_hook)

    def keys(self):
        with self._lock, self._connect() as conn:
            rows = conn.execute("SELECT id FROM projects").fetchall()
        return [r[0] for r in rows]