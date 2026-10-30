#!/usr/bin/env bash
# Odświeża plik z transakcjami RCN: pobiera świeże dane, sprawdza je i podmienia plik atomowo.
# Zapisuje też mały plik rcn_meta.json (wersja danych), który aplikacje sprawdzają zanim pobiorą duży plik.
set -euo pipefail
OUT="${OPERAT_RCN_OUT:-/var/www/operat-data}"; EXPORT="${OPERAT_RCN_EXPORT:-/opt/operat-rcn/rcn_export.py}"; EXPORT_INNE="${OPERAT_RCN_EXPORT_INNE:-/opt/operat-rcn/rcn_export_inne.py}"; TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
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
# Domy, obiekty niemieszkalne i grunty (warstwy budynki + dzialki). Awaria tego kroku NIE blokuje odświeżenia mieszkań.
INNE_OK=0
if [ -f "$EXPORT_INNE" ] && python3 "$EXPORT_INNE" --out "$TMP/inne.json" 2> "$TMP/log_inne.txt"; then
  if python3 - "$TMP/inne.json" "$OUT/rcn_inne.json" <<'PY'
import json, os, sys
new = json.load(open(sys.argv[1]))['meta']['rekordow']; old = 0
if os.path.exists(sys.argv[2]):
    try: old = json.load(open(sys.argv[2]))['meta'].get('rekordow', 0)
    except Exception: pass
sys.exit(0 if new >= 200 and not (old and new < old * 0.9) else 1)
PY
  then install -m 644 "$TMP/inne.json" "$OUT/rcn_inne.json.new" && mv -f "$OUT/rcn_inne.json.new" "$OUT/rcn_inne.json"; INNE_OK=1
  else echo "plik domów/gruntów odrzucony (za mały), zostaje poprzedni" >&2; fi
else tail -5 "$TMP/log_inne.txt" 2>/dev/null >&2 || true; echo "eksport domów/gruntów nie powiódł się, zostaje poprzedni plik" >&2; fi
python3 - "$OUT/rcn_lublin.json" "$OUT/rcn_meta.json" "$OUT/rcn_inne.json" <<'PY'
import json, os, sys
m = json.load(open(sys.argv[1]))['meta']; m['bajtow'] = os.path.getsize(sys.argv[1])
if os.path.exists(sys.argv[3]):
    mi = json.load(open(sys.argv[3]))['meta']; m['inne'] = dict(wersja=mi['wersja'], rekordow=mi['rekordow'], bajtow=os.path.getsize(sys.argv[3]), pobrano=mi.get('pobrano'))
open(sys.argv[2] + '.new', 'w').write(json.dumps(m, ensure_ascii=False)); os.replace(sys.argv[2] + '.new', sys.argv[2])
print('RCN odświeżone:', m['rekordow'], 'rekordów, wersja', m['wersja'] + (f", domy i grunty: {m['inne']['rekordow']} transakcji, wersja {m['inne']['wersja']}" if 'inne' in m else ', domy i grunty: brak pliku'))
PY
