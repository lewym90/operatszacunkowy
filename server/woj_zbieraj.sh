#!/usr/bin/env bash
# Zbiera komplet danych dla województwa lubelskiego do osobnego katalogu. Lublina i działającej aplikacji nie dotyka.
# Uruchamiane w tle (systemd-run), więc zerwanie połączenia nie przerywa pracy. Postęp: journalctl -u operat-woj -f
# Użycie: woj_zbieraj.sh URL_LOKALE URL_BUDYNKI URL_DZIALKI
set -euo pipefail
B="${OPERAT_BASE:-https://lewym90.github.io/operatszacunkowy}"; D="${OPERAT_RCN_OUT:-/var/www/operat-data}/woj"; R="${OPERAT_WOJ_DIR:-/var/lib/operat-woj}"; PRG="${OPERAT_PRG_URL:-https://opendata.geoportal.gov.pl/prg/adresy/06_Punkty_Adresowe.zip}"
if [ "${1:-}" != "--w-tle" ] && [ -z "${OPERAT_BEZ_TLA:-}" ]; then
  [ $# -eq 3 ] || { echo "Podaj trzy adresy paczek: lokale, budynki, działki" >&2; exit 2; }
  mkdir -p "$R"; curl -fsSL "$B/server/woj_zbieraj.sh" -o "$R/woj_zbieraj.sh"
  systemd-run --unit=operat-woj --collect --nice=10 --setenv=OPERAT_BASE="$B" /bin/bash "$R/woj_zbieraj.sh" --w-tle "$1" "$2" "$3"
  echo "Uruchomione w tle. Możesz zamknąć połączenie. Sprawdzenie stanu: tail -3 $R/stan.txt"; exit 0
fi
[ "${1:-}" = "--w-tle" ] && shift
mkdir -p "$R/kod" "$R/paczki" "$D"; S="$R/stan.txt"; krok() { echo "$(date '+%F %T') $*" | tee -a "$S"; }
: > "$S"; krok "start"
python3 -c 'import pyarrow' 2>/dev/null || { krok "instaluję pyarrow"; [ -x "$R/venv/bin/python" ] || python3 -m venv "$R/venv"; "$R/venv/bin/pip" -q install pyarrow; }
PY=python3; [ -x "$R/venv/bin/python" ] && PY="$R/venv/bin/python"
for f in rcn_export.py rcn_export_inne.py rcn_paczka.py osm_export.py; do curl -fsSL "$B/tools/$f" -o "$R/kod/$f"; done
krok "pobieram paczki RCN i PRG"
curl -fsSL --retry 3 "$1" -o "$R/paczki/l.parquet"; curl -fsSL --retry 3 "$2" -o "$R/paczki/b.parquet"; curl -fsSL --retry 3 "$3" -o "$R/paczki/d.parquet"; curl -fsSL --retry 3 "$PRG" -o "$R/paczki/prg.zip"
krok "przetwarzam RCN (punkty z ULDK dla transakcji od 2021, można przerwać i wznowić)"
"$PY" "$R/kod/rcn_paczka.py" --lokale "$R/paczki/l.parquet" --budynki "$R/paczki/b.parquet" --dzialki "$R/paczki/d.parquet" --prg "$R/paczki/prg.zip" --out "$R/nowe" --uldk "$R/uldk.json" ${OPERAT_ULDK_LIMIT:+--uldk-limit "$OPERAT_ULDK_LIMIT"} >> "$S" 2>&1
cp -f "$R"/nowe/* "$D"/; chmod 644 "$D"/*; rm -f "$R"/paczki/*
if [ -z "${OPERAT_BEZ_OSM:-}" ]; then
  krok "pobieram OSM dla województwa"
  if "$PY" "$R/kod/osm_export.py" --out "$D/osm_woj.json.new" --bbox 50.20,21.55,52.35,24.20 --czas 280 >> "$S" 2>&1; then mv -f "$D/osm_woj.json.new" "$D/osm_woj.json"; chmod 644 "$D/osm_woj.json"; else rm -f "$D/osm_woj.json.new"; krok "OSM NIE POBRANE, RCN jest gotowe"; fi
fi
krok "KONIEC: $(ls "$D" | wc -l) plików, $(du -sh "$D" | cut -f1)"
