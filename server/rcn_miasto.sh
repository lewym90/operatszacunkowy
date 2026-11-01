#!/usr/bin/env bash
# Eksport transakcji RCN dla innego miasta niż Lublin (punkt 14). Uruchamia ten sam eksport z innym środkiem obszaru.
# Użycie (jako root na serwerze):  bash rcn_miasto.sh chelm 51.143 23.472 [promień_km]
#   Chełm  51.143 23.472  |  Zamość 50.723 23.252  |  Puławy 51.416 21.969   (współrzędne orientacyjne środka miasta, sprawdź na mapie)
# Wynik: /var/www/operat-data/rcn_<nazwa>.json (ten sam format co rcn_lublin.json). Lublin i jego odświeżanie nie są ruszane.
set -euo pipefail
[ $# -ge 3 ] || { echo "użycie: $0 <nazwa> <szerokość> <długość> [promień_km]"; exit 2; }
NAME="$1"; LAT="$2"; LON="$3"; R="${4:-10}"
OUT="${OPERAT_RCN_OUT:-/var/www/operat-data}"; EXPORT="${OPERAT_RCN_EXPORT:-/opt/operat-rcn/rcn_export.py}"
case "$NAME" in *[!a-z0-9_]*|"") echo "nazwa: tylko małe litery, cyfry i _"; exit 2;; esac
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
python3 "$EXPORT" --center "$LAT,$LON" --radius-km "$R" --out "$TMP/rcn.json" 2> "$TMP/log.txt" || { tail -5 "$TMP/log.txt" >&2; echo "eksport nie powiódł się" >&2; exit 1; }
python3 - "$TMP/rcn.json" <<'PY'
import json, sys
m = json.load(open(sys.argv[1]))['meta']; n = m['rekordow']
print(f"rekordów: {n}, bez współrzędnych: {m.get('bez_wspolrzednych')}")
if n < 200: sys.exit("podejrzanie mało rekordów; nie zapisuję (sprawdź współrzędne środka)")
PY
install -m 644 "$TMP/rcn.json" "$OUT/rcn_$NAME.json.new" && mv -f "$OUT/rcn_$NAME.json.new" "$OUT/rcn_$NAME.json"
echo "Gotowe: $OUT/rcn_$NAME.json"
