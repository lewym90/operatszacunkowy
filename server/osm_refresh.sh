#!/usr/bin/env bash
# Odświeża plik z punktami otoczenia z OpenStreetMap (osm_lublin.json). Zły/pusty wynik nie podmienia poprzedniego pliku.
set -euo pipefail
OUT="${OPERAT_RCN_OUT:-/var/www/operat-data}"; EXPORT="${OPERAT_OSM_EXPORT:-/opt/operat-rcn/osm_export.py}"; TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
python3 "$EXPORT" --out "$TMP/osm.json" 2> "$TMP/log.txt" || { tail -8 "$TMP/log.txt" >&2; echo "pobranie OSM nie powiodło się, zostaje poprzedni plik" >&2; exit 1; }
python3 - "$TMP/osm.json" "$OUT/osm_lublin.json" <<'PY'
import json, os, sys
new = json.load(open(sys.argv[1]))['meta']['liczby']
if min(new['przystanki'], new['szkoly'], new['parki']) < 20: sys.exit(f'podejrzanie mało punktów {new}; zostaje poprzedni plik')
if os.path.exists(sys.argv[2]):
    try:
        old = json.load(open(sys.argv[2]))['meta']['liczby']
        if any(new.get(k, 0) < v * 0.7 for k, v in old.items() if v >= 20): sys.exit(f'nowy plik wyraźnie uboższy {new} wobec {old}; zostaje poprzedni')
    except Exception: pass
PY
install -m 644 "$TMP/osm.json" "$OUT/osm_lublin.json.new" && mv -f "$OUT/osm_lublin.json.new" "$OUT/osm_lublin.json"
echo "OSM odświeżone: $(python3 -c "import json;print(json.load(open('$OUT/osm_lublin.json'))['meta']['liczby'])")"
