"""
Shared pytest fixtures for the backend test suite.

Two isolation layers matter here, and both exist because app.py reads
configuration (DATABASE_URL, PDF_OUTPUT_FOLDER, ...) and builds its global
`sessions` store at MODULE IMPORT TIME, not per-request:

1. `app.py` gets force-reimported fresh for every test (`_reload_app`) so
   each test can flip DATABASE_URL / mock Gemini without leaking state
   between tests via Python's module cache.
2. The SQLite-backed tests are pointed at a throwaway per-test file instead
   of the real `backend/roomscan.db` (which is the developer's actual local
   data) by monkeypatching the `SQLiteSessionStore` class itself BEFORE
   app.py imports it — swapping the constructor default is not enough,
   since app.py calls `SQLiteSessionStore()` with no arguments.

Postgres-backed tests (auth/accounts, which are gated behind
USING_POSTGRES) spin up a real, throwaway, session-scoped Postgres cluster
via `initdb`/`pg_ctl` if a local Postgres install is found (Homebrew's
postgresql@15 on this machine) — never Railway, never anything persistent.
If no local Postgres binaries are available, those tests skip cleanly
instead of failing, so the rest of the suite still runs anywhere.
"""

import io
import os
import shutil
import socket
import subprocess
import sys

import pytest
from PIL import Image


# ---------------------------------------------------------------------------
# Small shared helpers
# ---------------------------------------------------------------------------

def fake_jpeg_bytes(size=(24, 24), color=(120, 130, 140)):
    """A tiny real JPEG — Gemini calls are mocked, but PIL still opens/resizes
    every uploaded image before it gets anywhere near a prompt, so the bytes
    have to be genuinely decodable."""
    buf = io.BytesIO()
    Image.new('RGB', size, color=color).save(buf, format='JPEG')
    return buf.getvalue()


def fake_jpeg_file(filename='photo.jpg', **kwargs):
    """A (file-like, filename) tuple ready to drop into a Flask test
    client's multipart `data` dict — Werkzeug's test client needs an actual
    readable file object for a field to be treated as an upload, not raw
    bytes (which just becomes a plain form field instead)."""
    return (io.BytesIO(fake_jpeg_bytes(**kwargs)), filename)


class FakeGeminiResponse:
    def __init__(self, text):
        self.text = text


class FakeGeminiModel:
    """Stands in for the real `genai.GenerativeModel`. Each test queues the
    canned `.text` it wants back, in call order — every AI-calling function
    in app.py calls `initialize_gemini()` fresh and then
    `model.generate_content(...)` exactly once (twice only on the chat
    JSON-parse-retry path), so a simple FIFO queue matches real call order
    without needing to inspect the prompt."""

    def __init__(self):
        self._responses = []
        self.prompts = []  # every prompt/content this was called with, in order

    def queue(self, text):
        self._responses.append(text)
        return self

    def generate_content(self, content, *_args, **_kwargs):
        self.prompts.append(content)
        if not self._responses:
            raise AssertionError(
                'FakeGeminiModel.generate_content() called with no canned '
                'response queued — add one more mock_gemini.queue(...) call.'
            )
        return FakeGeminiResponse(self._responses.pop(0))


# ---------------------------------------------------------------------------
# app.py reload machinery
# ---------------------------------------------------------------------------

def _reload_app(monkeypatch, *, database_url=None, sqlite_path=None, pdf_folder=None):
    # IMPORTANT: app.py calls load_dotenv() at import time, and python-dotenv
    # only fills in a var that's genuinely ABSENT from os.environ — so
    # monkeypatch.delenv() here isn't enough whenever the developer has a
    # real backend/.env with these keys set (this project does): dotenv
    # would just repopulate them the instant app.py gets reimported, silently
    # pointing "SQLite mode" tests at the real Railway database. Setting an
    # explicit empty string keeps the key present-but-falsy, which dotenv
    # respects and `bool(...)`/`os.getenv(..., default)` treat the same as
    # unset for every check app.py actually does.
    monkeypatch.setenv('DATABASE_URL', database_url or '')

    # Never let a test silently hit the real Cloudflare Turnstile verify
    # endpoint or require a real site key — verify_captcha() fails open
    # when this is unset/empty, which is exactly what tests want.
    monkeypatch.setenv('TURNSTILE_SECRET_KEY', '')

    # Pin to a fixed value instead of whatever real secret the developer's
    # .env happens to have — tests shouldn't depend on (or need to know)
    # the real production JWT signing key.
    monkeypatch.setenv('JWT_SECRET', 'test-only-jwt-secret')

    if pdf_folder is not None:
        monkeypatch.setenv('PDF_OUTPUT_FOLDER', str(pdf_folder))

    if sqlite_path is not None:
        import session_store as session_store_module
        real_cls = session_store_module.SQLiteSessionStore

        class _IsolatedSQLiteSessionStore(real_cls):
            def __init__(self, db_path=None):  # noqa: ARG002 - app.py calls with no args
                super().__init__(db_path=str(sqlite_path))

        monkeypatch.setattr(session_store_module, 'SQLiteSessionStore', _IsolatedSQLiteSessionStore)

    # app.py builds its `sessions` global (and reads every env var above)
    # at import time — a plain `import app` after the first test would just
    # return the already-cached module, so force a fresh execution.
    sys.modules.pop('app', None)
    import app as app_module
    app_module.app.config['TESTING'] = True
    return app_module


@pytest.fixture
def sqlite_app(monkeypatch, tmp_path):
    """The default fixture for anything that doesn't need real user
    accounts — the room/area/chat/measurement/recommendation flow, PDF
    formatting helpers, etc. Fast, no external process."""
    return _reload_app(
        monkeypatch,
        database_url=None,
        sqlite_path=tmp_path / 'test_sessions.db',
        pdf_folder=tmp_path / 'pdf_reports',
    )


@pytest.fixture
def sqlite_client(sqlite_app):
    return sqlite_app.app.test_client()


@pytest.fixture
def mock_gemini(sqlite_app, monkeypatch):
    fake = FakeGeminiModel()
    monkeypatch.setattr(sqlite_app, 'initialize_gemini', lambda: fake)
    return fake


# ---------------------------------------------------------------------------
# Ephemeral local Postgres, for the auth/accounts tests
# ---------------------------------------------------------------------------

def _find_pg_bin_dir():
    exe = shutil.which('initdb')
    if exe:
        return os.path.dirname(exe)
    for formula in ('postgresql@15', 'postgresql'):
        try:
            result = subprocess.run(
                ['brew', '--prefix', formula], capture_output=True, text=True, timeout=10
            )
        except (FileNotFoundError, subprocess.TimeoutExpired):
            return None
        if result.returncode == 0:
            candidate = os.path.join(result.stdout.strip(), 'bin')
            if os.path.exists(os.path.join(candidate, 'initdb')):
                return candidate
    return None


def _free_tcp_port():
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(('127.0.0.1', 0))
    port = s.getsockname()[1]
    s.close()
    return port


@pytest.fixture(scope='session')
def postgres_dsn(tmp_path_factory):
    """Spins up a real, throwaway, local-only Postgres cluster for the
    duration of the test session (never Railway, never anything that
    survives past the test run). Skips cleanly if no local Postgres install
    is found, so the rest of the suite is unaffected on a machine without
    one (e.g. plain CI without Homebrew)."""
    pg_bin = _find_pg_bin_dir()
    if pg_bin is None:
        pytest.skip('No local Postgres binaries found (checked PATH and `brew --prefix postgresql@15`) — skipping Postgres-backed tests')

    # In some sandboxed shells (seen in this dev environment), Postgres's
    # postmaster observes extra threads present at fork time — likely from
    # the sandbox's own process-launch hooks — and refuses to start
    # ("postmaster became multithreaded during startup") as a safety
    # measure that's really meant for a different problem (fork() after
    # threads were started inside postgres itself, not before it even
    # forked). Disabling Objective-C's fork-safety check is the documented
    # workaround; harmless on a normal, unsandboxed machine too.
    pg_env = dict(os.environ, OBJC_DISABLE_INITIALIZE_FORK_SAFETY='YES', LC_ALL='C')

    data_dir = tmp_path_factory.mktemp('pgdata')
    subprocess.run(
        [os.path.join(pg_bin, 'initdb'), '-D', str(data_dir), '-U', 'postgres', '--auth=trust', '--no-sync'],
        check=True, capture_output=True, env=pg_env,
    )
    port = _free_tcp_port()
    log_file = data_dir / 'postgres.log'
    try:
        subprocess.run(
            [
                os.path.join(pg_bin, 'pg_ctl'), '-D', str(data_dir),
                '-o', f'-p {port} -h 127.0.0.1',
                '-l', str(log_file), '-w', 'start',
            ],
            check=True, capture_output=True, env=pg_env,
        )
    except subprocess.CalledProcessError:
        log_tail = log_file.read_text()[-2000:] if log_file.exists() else '(no log file)'
        pytest.skip(f'Local Postgres cluster failed to start — skipping Postgres-backed tests. Log tail:\n{log_tail}')

    dsn = f'postgresql://postgres@127.0.0.1:{port}/postgres'
    try:
        yield dsn
    finally:
        subprocess.run(
            [os.path.join(pg_bin, 'pg_ctl'), '-D', str(data_dir), '-m', 'fast', 'stop'],
            capture_output=True,
        )


def _truncate_postgres(dsn):
    import psycopg2
    conn = psycopg2.connect(dsn)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute('TRUNCATE TABLE projects, users RESTART IDENTITY CASCADE')
    finally:
        conn.close()


@pytest.fixture
def pg_app(monkeypatch, tmp_path, postgres_dsn):
    """Like sqlite_app, but with real user accounts backed by an ephemeral
    Postgres cluster — required for anything behind `require_auth` /
    USING_POSTGRES (signup, login, liability, per-user project listing)."""
    app_module = _reload_app(
        monkeypatch,
        database_url=postgres_dsn,
        sqlite_path=None,
        pdf_folder=tmp_path / 'pdf_reports',
    )
    # Tables are created (IF NOT EXISTS) by PostgresSessionStore.__init__ on
    # the line above — safe to truncate now regardless of test order.
    _truncate_postgres(postgres_dsn)
    return app_module


@pytest.fixture
def pg_client(pg_app):
    return pg_app.app.test_client()
