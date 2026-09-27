import os
import re
import psycopg2
import psycopg2.extras
import jwt
from functools import wraps
from flask import request, jsonify

# Automatically load .env file from backend directory if present
_env_path = os.path.join(os.path.dirname(__file__), '.env')
if os.path.exists(_env_path):
    with open(_env_path, 'r', encoding='utf-8') as _f:
        for _line in _f:
            _line = _line.strip()
            if _line and not _line.startswith('#') and '=' in _line:
                _k, _v = _line.split('=', 1)
                os.environ.setdefault(_k.strip(), _v.strip())

SUPABASE_CONFIG = {
    'host': os.environ.get('SUPABASE_DB_HOST', 'db.kznfilwdruljcqnfqtfx.supabase.co'),
    'port': int(os.environ.get('SUPABASE_DB_PORT', 5432)),
    'user': os.environ.get('SUPABASE_DB_USER', 'postgres'),
    'password': os.environ.get('SUPABASE_DB_PASSWORD', ''),
    'dbname': os.environ.get('SUPABASE_DB_NAME', 'postgres'),
    'sslmode': os.environ.get('SUPABASE_DB_SSLMODE', 'require'),
    'keepalives': 1,
    'keepalives_idle': 30,
    'keepalives_interval': 10,
    'keepalives_count': 5
}

# Backward compatibility alias
DB_CONFIG = SUPABASE_CONFIG
SECRET_KEY = 'clucko_secret_key_2026'

class PostgresCursorWrapper:
    """
    Transparent wrapper around psycopg2 RealDictCursor that:
    1. Supports cur.lastrowid on INSERT queries by automatically appending RETURNING id.
    2. Rewrites MySQL-style INTERVAL syntax (INTERVAL 4 SECOND -> INTERVAL '4 SECOND').
    3. Provides seamless dictionary access (row['col']) compatible with PyMySQL DictCursor.
    """
    def __init__(self, cursor):
        self._cur = cursor
        self.lastrowid = None

    def execute(self, query, params=None):
        # 1. Translate MySQL-specific INTERVAL syntax to PostgreSQL
        query = re.sub(r'\bINTERVAL\s+(\d+)\s+([A-Za-z]+)\b', r"INTERVAL '\1 \2'", query, flags=re.IGNORECASE)

        # 2. Check for INSERT without RETURNING
        is_insert = bool(re.match(r'^\s*INSERT\s+INTO\s+', query, re.IGNORECASE))
        has_returning = bool(re.search(r'\bRETURNING\b', query, re.IGNORECASE))
        is_notif_reads = bool(re.search(r'INSERT\s+INTO\s+notification_reads\b', query, re.IGNORECASE))

        if is_insert and not has_returning and not is_notif_reads:
            clean_query = query.rstrip().rstrip(';') + ' RETURNING id'
            try:
                self._cur.execute(clean_query, params)
                res = self._cur.fetchone()
                if res and 'id' in res:
                    self.lastrowid = res['id']
                return
            except Exception:
                # If RETURNING id fails (e.g., table has no 'id' column), rollback sub-transaction and run original
                try:
                    self._cur.connection.rollback()
                except Exception:
                    pass

        self._cur.execute(query, params)

    def executemany(self, query, seq_of_params):
        query = re.sub(r'\bINTERVAL\s+(\d+)\s+([A-Za-z]+)\b', r"INTERVAL '\1 \2'", query, flags=re.IGNORECASE)
        return self._cur.executemany(query, seq_of_params)

    def fetchone(self):
        return self._cur.fetchone()

    def fetchall(self):
        return self._cur.fetchall()

    @property
    def rowcount(self):
        return self._cur.rowcount

    @property
    def description(self):
        return self._cur.description

    def close(self):
        return self._cur.close()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

import threading
from psycopg2 import pool

_pool_lock = threading.Lock()
_connection_pool = None

def get_pool():
    global _connection_pool
    if _connection_pool is None:
        with _pool_lock:
            if _connection_pool is None:
                _connection_pool = pool.ThreadedConnectionPool(
                    minconn=2,
                    maxconn=20,
                    **SUPABASE_CONFIG
                )
    return _connection_pool

class PostgresConnectionWrapper:
    """
    Transparent wrapper around psycopg2 connection matching PyMySQL connection interface.
    """
    def __init__(self, conn, db_pool=None):
        self._conn = conn
        self._pool = db_pool
        self._is_closed = False

    def cursor(self, *args, **kwargs):
        cur = self._conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        return PostgresCursorWrapper(cur)

    def commit(self):
        return self._conn.commit()

    def rollback(self):
        try:
            return self._conn.rollback()
        except Exception:
            pass

    def close(self):
        if self._is_closed:
            return
        self._is_closed = True
        if self._pool is not None:
            try:
                if not self._conn.closed:
                    self._conn.rollback()
                self._pool.putconn(self._conn)
            except Exception:
                try:
                    self._conn.close()
                except Exception:
                    pass
        else:
            try:
                self._conn.close()
            except Exception:
                pass

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            self.rollback()
        else:
            self.commit()
        self.close()

def get_db():
    try:
        p = get_pool()
        conn = p.getconn()
        if conn.closed != 0:
            try:
                p.putconn(conn, close=True)
            except Exception:
                pass
            conn = p.getconn()
        return PostgresConnectionWrapper(conn, db_pool=p)
    except Exception:
        # Fallback to direct connection if pool is temporarily unavailable or exhausted
        conn = psycopg2.connect(**SUPABASE_CONFIG)
        return PostgresConnectionWrapper(conn, db_pool=None)

import time

_LAST_ACTIVE_MAP = {}

def record_user_activity(user_id):
    if not user_id:
        return
    now = time.time()
    last = _LAST_ACTIVE_MAP.get(user_id, 0)
    if now - last > 60:
        _LAST_ACTIVE_MAP[user_id] = now
        try:
            db = get_db()
            with db.cursor() as cur:
                cur.execute('UPDATE users SET last_active_at = NOW() WHERE id = %s', (user_id,))
                db.commit()
            db.close()
        except Exception:
            pass

def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization', '').strip()
        if not auth_header:
            return jsonify({'error': 'Token missing'}), 401

        token = auth_header.replace('Bearer ', '').strip()
        if not token or token.lower() in ('null', 'undefined', 'none'):
            return jsonify({'error': 'Token missing'}), 401

        try:
            data = jwt.decode(token, SECRET_KEY, algorithms=['HS256'])
            user_id = data.get('user_id')
            if not user_id:
                return jsonify({'error': 'Invalid token'}), 401
            request.user_id = user_id
            record_user_activity(user_id)
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token expired'}), 401
        except Exception:
            return jsonify({'error': 'Invalid token'}), 401

        return f(*args, **kwargs)
    return decorated
