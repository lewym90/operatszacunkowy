#!/usr/bin/env bash
# Uruchamia świeży serwer synchronizacji na wolnym porcie, odpala test i sprząta.
set -u
here="$(cd "$(dirname "$0")/.." && pwd)"; tmp="$(mktemp -d)"; port=$((20000 + RANDOM % 20000)); key="testkey-0123456789-abcdefghijk"
OPERAT_SYNC_KEY=$key OPERAT_SYNC_DB="$tmp/sync.db" OPERAT_SYNC_PORT=$port python3 "$here/server/sync_server.py" & pid=$!
sleep 1
node "$here/test/sync.test.mjs" "http://127.0.0.1:$port" "$key"; rc=$?
kill $pid 2>/dev/null; rm -rf "$tmp"; exit $rc
