#!/usr/bin/env python3
"""Serwer synchronizacji OPERAT SZACUNKOWY: jeden plik, bez zależności (biblioteka standardowa).

Przechowuje rekordy (oferty, własne umowy, wyceny, ustawienia) w SQLite. Aplikacja na każdym urządzeniu
wysyła swoje zmiany i pobiera cudze. Dostęp tylko z tajnym kluczem (nagłówek Authorization: Bearer ...).
Konflikt tego samego rekordu rozstrzyga nowszy znacznik czasu (ostatni zapis wygrywa).

Uruchomienie:  OPERAT_SYNC_KEY=... OPERAT_SYNC_DB=/var/lib/operat-sync/sync.db python3 sync_server.py
Nasłuch: 127.0.0.1:8787 (publicznie wystawia go Caddy po HTTPS).
"""
import hmac, json, os, shutil, sqlite3, sys, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

KEY = os.environ.get('OPERAT_SYNC_KEY', '')
DB = os.environ.get('OPERAT_SYNC_DB', 'sync.db')
HOST = os.environ.get('OPERAT_SYNC_HOST', '127.0.0.1')
PORT = int(os.environ.get('OPERAT_SYNC_PORT', '8787'))
MAX_BODY = 60 * 1024 * 1024
PAGE = 2000
COLLS = {'offers', 'wlasne', 'wyceny', 'budynki', 'ust'}
LOCK = threading.Lock()


def db():
    c = sqlite3.connect(DB, timeout=30)
    c.execute('PRAGMA journal_mode=WAL')
    return c


def init():
    os.makedirs(os.path.dirname(os.path.abspath(DB)), exist_ok=True)
    with db() as c:
        c.execute('CREATE TABLE IF NOT EXISTS rec (c TEXT NOT NULL, id TEXT NOT NULL, ts INTEGER NOT NULL, seq INTEGER NOT NULL, del INTEGER NOT NULL DEFAULT 0, d TEXT, PRIMARY KEY (c, id))')
        c.execute('CREATE INDEX IF NOT EXISTS rec_seq ON rec (seq)')
        c.execute('CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v INTEGER)')
        c.execute("INSERT OR IGNORE INTO meta VALUES ('seq', 0)")


def snapshot_loop():
    """Raz na dobę kopia bazy (7 ostatnich) obok pliku bazy."""
    while True:
        try:
            d = os.path.join(os.path.dirname(os.path.abspath(DB)), 'kopie'); os.makedirs(d, exist_ok=True)
            name = os.path.join(d, 'sync-' + time.strftime('%Y-%m-%d') + '.db')
            if not os.path.exists(name) and os.path.exists(DB):
                with LOCK:
                    src = db(); dst = sqlite3.connect(name); src.backup(dst); dst.close(); src.close()
                old = sorted(f for f in os.listdir(d) if f.startswith('sync-'))[:-7]
                for f in old: os.remove(os.path.join(d, f))
        except Exception as e:
            print('kopia:', e, file=sys.stderr)
        time.sleep(3600)


def apply_sync(body):
    since = int(body.get('since') or 0)
    changes = body.get('changes') or []
    touched = []
    with LOCK, db() as c:
        seq = c.execute("SELECT v FROM meta WHERE k='seq'").fetchone()[0]
        for ch in changes:
            cn, rid = ch.get('c'), str(ch.get('id', ''))
            if cn not in COLLS or not rid: continue
            ts = int(ch.get('ts') or 0); dele = 1 if ch.get('del') else 0
            row = c.execute('SELECT ts FROM rec WHERE c=? AND id=?', (cn, rid)).fetchone()
            touched.append((cn, rid))
            if row is not None and row[0] > ts: continue   # na serwerze jest nowsza wersja: ona wygrywa
            seq += 1
            d = None if dele else json.dumps(ch.get('d'), ensure_ascii=False, separators=(',', ':'))
            c.execute('INSERT OR REPLACE INTO rec (c, id, ts, seq, del, d) VALUES (?,?,?,?,?,?)', (cn, rid, ts, seq, dele, d))
        c.execute("UPDATE meta SET v=? WHERE k='seq'", (seq,))
        rows = c.execute('SELECT c, id, ts, seq, del, d FROM rec WHERE seq>? ORDER BY seq LIMIT ?', (since, PAGE + 1)).fetchall()
        more = len(rows) > PAGE; rows = rows[:PAGE]
        seen = {(r[0], r[1]) for r in rows}
        # wersje, które wygrały z przesłanymi zmianami, wracają do urządzenia nawet jeśli ich seq <= since
        extra = []
        for k in touched:
            if k in seen: continue
            r = c.execute('SELECT c, id, ts, seq, del, d FROM rec WHERE c=? AND id=?', k).fetchone()
            if r: extra.append(r); seen.add(k)
    out = [{'c': r[0], 'id': r[1], 'ts': r[2], 'seq': r[3], 'del': bool(r[4]), 'd': json.loads(r[5]) if r[5] else None} for r in rows + extra]
    cursor = rows[-1][3] if more else seq   # gdy nic nie zostało do pobrania, urządzenie jest na bieżąco
    return {'cursor': cursor, 'more': more, 'records': out}


class H(BaseHTTPRequestHandler):
    server_version = 'OperatSync/1'

    def log_message(self, fmt, *a):
        pass

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Max-Age', '86400')

    def _send(self, code, obj):
        b = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code); self._cors()
        self.send_header('Content-Type', 'application/json; charset=utf-8'); self.send_header('Content-Length', str(len(b))); self.send_header('Cache-Control', 'no-store')
        self.end_headers(); self.wfile.write(b)

    def _auth(self):
        tok = (self.headers.get('Authorization') or '')[7:] if (self.headers.get('Authorization') or '').startswith('Bearer ') else ''
        return bool(KEY) and hmac.compare_digest(tok.encode(), KEY.encode())

    def do_OPTIONS(self):
        self.send_response(204); self._cors(); self.end_headers()

    def do_GET(self):
        if not self._auth(): return self._send(401, {'error': 'zły klucz'})
        if self.path.rstrip('/').endswith('/ping'):
            with db() as c:
                n = c.execute('SELECT COUNT(*) FROM rec WHERE del=0').fetchone()[0]
            return self._send(200, {'ok': True, 'v': 1, 'records': n})
        self._send(404, {'error': 'nie ma takiej ścieżki'})

    def do_POST(self):
        if not self._auth(): return self._send(401, {'error': 'zły klucz'})
        if not self.path.rstrip('/').endswith('/sync'): return self._send(404, {'error': 'nie ma takiej ścieżki'})
        try:
            n = int(self.headers.get('Content-Length') or 0)
            if n > MAX_BODY: return self._send(413, {'error': 'za duże żądanie'})
            body = json.loads(self.rfile.read(n) or b'{}')
            self._send(200, apply_sync(body))
        except Exception as e:
            self._send(400, {'error': str(e)})


if __name__ == '__main__':
    if len(KEY) < 24:
        sys.exit('Ustaw OPERAT_SYNC_KEY (min. 24 znaki).')
    init()
    threading.Thread(target=snapshot_loop, daemon=True).start()
    ThreadingHTTPServer((HOST, PORT), H).serve_forever()
