#!/usr/bin/env bash
# Test trafności wyceny najmu. Tylko czyta dane, niczego nie zmienia; pliki robocze znikają po zakończeniu.
set -euo pipefail
B=https://lewym90.github.io/operatszacunkowy; DB="${OPERAT_SYNC_DB:-/var/lib/operat-sync/sync.db}"; D="${OPERAT_RCN_OUT:-/var/www/operat-data}"; WYN=/root/najem_test_wynik.txt
command -v node >/dev/null || { echo "Instaluję Node.js (jednorazowo)..."; apt-get install -y nodejs >/dev/null; }
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT; mkdir "$T/js"; echo '{"type":"module"}' > "$T/package.json"
for f in js/engine.js js/rcn.js; do curl -fsSL "$B/$f" -o "$T/$f"; done; curl -fsSL "$B/tools/najem_test.mjs" -o "$T/najem_test.mjs"
python3 - "$DB" "$T" <<'PY'
import json, sqlite3, sys
c = sqlite3.connect('file:' + sys.argv[1] + '?mode=ro', uri=True)
oferty = [json.loads(r[0]) for r in c.execute("SELECT d FROM rec WHERE c='offers' AND del=0 AND d IS NOT NULL")]
ust = c.execute("SELECT d FROM rec WHERE c='ust' AND del=0 AND d IS NOT NULL").fetchone()
json.dump(oferty, open(sys.argv[2] + '/oferty.json', 'w')); json.dump(json.loads(ust[0]) if ust else {}, open(sys.argv[2] + '/ust.json', 'w'))
PY
cd "$T"; nice -n 10 node najem_test.mjs oferty.json "$D/rcn_lublin.json" "$D/osm_lublin.json" ust.json | tee "$WYN"
echo; echo "KONIEC. Wynik zapisany też w $WYN"
