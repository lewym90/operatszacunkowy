#!/usr/bin/env bash
# Odświeża plik z transakcjami RCN: pobiera świeże dane, sprawdza je i podmienia plik atomowo.
# Zapisuje też mały plik rcn_meta.json (wersja danych), który aplikacje sprawdzają zanim pobiorą duży plik.
set -euo pipefail
OUT="${OPERAT_RCN_OUT:-/var/www/operat-data}"; EXPORT="${OPERAT_RCN_EXPORT:-/opt/operat-rcn/rcn_export.py}"; TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
python3 "$EXPORT" --out "$TMP/rcn.json" 2> "$TMP/log.txt" || { tail -5 "$TMP/log.txt" >&2; echo "eksport RCN nie powiódł się, zostaje poprzedni plik" >&2; exit 1; }
python3 - "$TMP/rcn.json" "$OUT/rcn_lublin.json" <<'PY'
import json, os, sys
new = json.load(open(sys.argv[1]))
n = new['meta']['rekordow']
old = 0
if os.path.exists(sys.argv[2]):
    try: old = json.load(open(sys.argv[2]))['meta'].get('rekordow', 0)
    except Exception: pass
if n < 1000 or (old and n < old * 0.9):
    sys.exit(f"nowy plik podejrzanie mały ({n} wobec {old}); zostaje poprzedni")
PY
install -m 644 "$TMP/rcn.json" "$OUT/rcn_lublin.json.new" && mv -f "$OUT/rcn_lublin.json.new" "$OUT/rcn_lublin.json"
python3 - "$OUT/rcn_lublin.json" "$OUT/rcn_meta.json" <<'PY'
import json, os, sys
m = json.load(open(sys.argv[1]))['meta']; m['bajtow'] = os.path.getsize(sys.argv[1])
open(sys.argv[2] + '.new', 'w').write(json.dumps(m, ensure_ascii=False)); os.replace(sys.argv[2] + '.new', sys.argv[2])
print('RCN odświeżone:', m['rekordow'], 'rekordów, wersja', m['wersja'])
PY
