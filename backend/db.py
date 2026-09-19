"""
db.py — Postgres-backed persistence + auth for the home organizing app.

Replaces the old anonymous, single-table SQLite store with:
  - `users`: email/password accounts (bcrypt-hashed passwords).
  - `projects`: same JSON-blob-per-project shape the app already used,
    now scoped to a `user_id` so projects are private and resumable across
    devices/app restarts.

IMPORTANT — Railway internal vs. public hostname:
  Railway's Postgres "internal" connection string (host ending in
  `.railway.internal`) only resolves from OTHER services running inside
  the same Railway project. It will NOT resolve from your laptop. To run
  this backend locally against your Railway database, open the Postgres
  service in the Railway dashboard -> "Connect" tab -> copy the PUBLIC
  connection string (has a real host + port, not `.railway.internal`) and
  put THAT in backend/.env as DATABASE_URL. If DATABASE_URL is unset or
  unreachable, this module logs a clear warning and the app falls back to
  the old local SQLite store (no accounts/login in that mode).
"""

import os
import re
import json
import logging
import threading
from datetime import datetime
from typing import Any, Dict, Iterator, Optional, Tuple

logger = logging.getLogger(__name__)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class _JSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, datetime):
            return {"__datetime__": obj.isoformat()}
        return super().default(obj)


def _json_object_hook(d):
    if "__datetime__" in d:
        return datetime.fromisoformat(d["__datetime__"])
    return d


class PostgresSessionStore:
    """
    Dict-like store for `sessions[project_id]`, same protocol as the old
    SQLiteSessionStore (so every existing app.py call site keeps working
    unchanged), plus user-account methods (create_user/authenticate/etc.)
    and ownership-aware helpers (create_for_user/list_for_user/get_owner).
    """

    def __init__(self, dsn: str):
        import psycopg2
        import psycopg2.pool

        self._psycopg2 = psycopg2
        self.pool = psycopg2.pool.SimpleConnectionPool(1, 10, dsn)
        self._lock = threading.Lock()
        self._init_db()

    def _conn(self):
        return self.pool.getconn()

    def _put(self, conn):
        self.pool.putconn(conn)

    def _init_db(self) -> None:
        conn = self._conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS users (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        email TEXT UNIQUE NOT NULL,
                        password_hash TEXT NOT NULL,
                        tier TEXT NOT NULL DEFAULT 'paid',
                        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
                    )
                    """
                )
                cur.execute(
                    """
                    CREATE TABLE IF NOT EXISTS projects (
                        id TEXT PRIMARY KEY,
                        user_id UUID REFERENCES users(id) ON DELETE CASCADE,
                        data JSONB NOT NULL,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
                    )
                    """
                )
                # gen_random_uuid() needs pgcrypto on some Postgres versions.
                try:
                    cur.execute('CREATE EXTENSION IF NOT EXISTS pgcrypto')
                except Exception:
                    conn.rollback()
                else:
                    conn.commit()
                conn.commit()

                # Defensive migration: CREATE TABLE IF NOT EXISTS is a no-op
                # against a `projects` table that already existed on this
                # database with a different schema (seen in practice: a
                # NOT NULL on user_id, which breaks every generic write via
                # __setitem__ below since that path — used for anonymous
                # sessions and for updating an already-created project — has
                # no user_id to supply). Force it nullable either way; this
                # is a harmless no-op if it's already nullable.
                try:
                    cur.execute('ALTER TABLE projects ALTER COLUMN user_id DROP NOT NULL')
                    conn.commit()
                except Exception as e:
                    conn.rollback()
                    logger.warning(f"⚠️  Could not relax projects.user_id NOT NULL (may already be nullable): {e}")

                # Records when a user accepted the liability disclaimer —
                # NULL means "not yet accepted", shown once per account
                # right after signup/first login and never again once set.
                try:
                    cur.execute('ALTER TABLE users ADD COLUMN IF NOT EXISTS liability_accepted_at TIMESTAMPTZ')
                    conn.commit()
                except Exception as e:
                    conn.rollback()
                    logger.warning(f"⚠️  Could not add users.liability_accepted_at: {e}")
        finally:
            self._put(conn)

    # -- dict-like protocol (project id -> data blob) -----------------------

    def __contains__(self, key: str) -> bool:
        conn = self._conn()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT 1 FROM projects WHERE id = %s", (key,))
                return cur.fetchone() is not None
        finally:
            self._put(conn)

    def __getitem__(self, key: str) -> Dict[str, Any]:
        conn = self._conn()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT data FROM projects WHERE id = %s", (key,))
                row = cur.fetchone()
                if row is None:
                    raise KeyError(key)
                return json.loads(json.dumps(row[0]), object_hook=_json_object_hook)
        finally:
            self._put(conn)

    def __setitem__(self, key: str, value: Dict[str, Any]) -> None:
        # Update-first rather than a blind INSERT ... ON CONFLICT: this
        # method never has a user_id to supply (the dict-protocol callers
        # throughout app.py only ever deal in project_id -> data), and
        # Postgres validates NOT NULL constraints against the PROPOSED
        # insert row even when the statement ultimately resolves via
        # ON CONFLICT DO UPDATE — so a blind insert-with-conflict here would
        # fail on any NOT NULL column we don't supply, for a row that
        # already exists and doesn't even need inserting. Only fall back to
        # a real INSERT for a genuinely new (anonymous/no-account) project.
        payload = json.loads(json.dumps(value, cls=_JSONEncoder))
        conn = self._conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE projects SET data = %s, updated_at = now() WHERE id = %s",
                    (json.dumps(payload), key),
                )
                if cur.rowcount == 0:
                    cur.execute(
                        "INSERT INTO projects (id, data, updated_at) VALUES (%s, %s, now())",
                        (key, json.dumps(payload)),
                    )
                conn.commit()
        finally:
            self._put(conn)

    def __delitem__(self, key: str) -> None:
        conn = self._conn()
        try:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM projects WHERE id = %s", (key,))
                conn.commit()
        finally:
            self._put(conn)

    def __len__(self) -> int:
        conn = self._conn()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM projects")
                return cur.fetchone()[0]
        finally:
            self._put(conn)

    def get(self, key: str, default: Optional[Dict[str, Any]] = None):
        try:
            return self[key]
        except KeyError:
            return default

    def items(self) -> Iterator[Tuple[str, Dict[str, Any]]]:
        conn = self._conn()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT id, data, created_at FROM projects")
                rows = cur.fetchall()
        finally:
            self._put(conn)
        for row_id, data, created_at in rows:
            parsed = json.loads(json.dumps(data), object_hook=_json_object_hook)
            parsed.setdefault('created_at', created_at)
            yield row_id, parsed

    # -- ownership-aware helpers ---------------------------------------------

    def create_for_user(self, project_id: str, user_id: str, data: Dict[str, Any]) -> None:
        payload = json.loads(json.dumps(data, cls=_JSONEncoder))
        conn = self._conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO projects (id, user_id, data) VALUES (%s, %s, %s)",
                    (project_id, user_id, json.dumps(payload)),
                )
                conn.commit()
        finally:
            self._put(conn)

    def get_owner(self, project_id: str) -> Optional[str]:
        conn = self._conn()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT user_id FROM projects WHERE id = %s", (project_id,))
                row = cur.fetchone()
                return str(row[0]) if row and row[0] else None
        finally:
            self._put(conn)

    def list_for_user(self, user_id: str):
        """Most-recently-updated first; used to power 'continue where you left off'."""
        conn = self._conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, data, updated_at
                    FROM projects
                    WHERE user_id = %s
                    ORDER BY updated_at DESC
                    """,
                    (user_id,),
                )
                rows = cur.fetchall()
        finally:
            self._put(conn)

        results = []
        for row_id, data, updated_at in rows:
            parsed = json.loads(json.dumps(data), object_hook=_json_object_hook)
            room_names = [r.get('type', '?') for r in parsed.get('rooms', [])]
            results.append({
                'id': row_id,
                'project_name': parsed.get('project_name'),
                'rooms': room_names,
                'has_report': bool(parsed.get('report')),
                'updated_at': updated_at.isoformat() if updated_at else None,
            })
        return results

    # -- user accounts ---------------------------------------------------------

    def create_user(self, email: str, password_hash: str) -> Dict[str, Any]:
        conn = self._conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO users (email, password_hash)
                    VALUES (%s, %s)
                    RETURNING id, email, tier, created_at
                    """,
                    (email.lower(), password_hash),
                )
                row = cur.fetchone()
                conn.commit()
                return {'id': str(row[0]), 'email': row[1], 'tier': row[2], 'liability_accepted': False}
        finally:
            self._put(conn)

    def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        conn = self._conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, email, password_hash, tier, liability_accepted_at FROM users WHERE email = %s",
                    (email.lower(),),
                )
                row = cur.fetchone()
                if not row:
                    return None
                return {'id': str(row[0]), 'email': row[1], 'password_hash': row[2], 'tier': row[3], 'liability_accepted': row[4] is not None}
        finally:
            self._put(conn)

    def get_user_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        conn = self._conn()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT id, email, tier, liability_accepted_at FROM users WHERE id = %s", (user_id,))
                row = cur.fetchone()
                if not row:
                    return None
                return {'id': str(row[0]), 'email': row[1], 'tier': row[2], 'liability_accepted': row[3] is not None}
        finally:
            self._put(conn)

    def accept_liability(self, user_id: str) -> None:
        conn = self._conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE users SET liability_accepted_at = now() WHERE id = %s AND liability_accepted_at IS NULL",
                    (user_id,),
                )
                conn.commit()
        finally:
            self._put(conn)


def validate_email(email: str) -> bool:
    return bool(email and EMAIL_RE.match(email.strip()))


def validate_password(password: str) -> Tuple[bool, Optional[str]]:
    if not password or len(password) < 8:
        return False, "Password must be at least 8 characters"
    return True, None
