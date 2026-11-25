#!/usr/bin/env bash
# Zbiera komplet danych RCN (lokale, budynki, działki) + adresy PRG + OSM dla jednego województwa do osobnego katalogu.
# Działającej aplikacji i plików Lublina nie dotyka. Uruchamiane w tle (systemd-run), zerwanie połączenia nie przerywa pracy.
# Użycie: woj_zbieraj.sh 12   (12 = małopolskie, 06 = lubelskie). Samo OSM (RCN już jest): woj_zbieraj.sh 12 osm Paczki są pod stałymi adresami „latest” Geoportalu.
# Wynik: /var/www/operat-data/woj/<kod>/ (rcn_<teryt>.json, rcn_inne_<teryt>.json, rcn_spis.json, osm_woj.json). Stan: /var/lib/operat-woj/<kod>/stan.txt
set -euo pipefail
B="${OPERAT_BASE:-https://lewym90.github.io/operatszacunkowy}"
if [ "${1:-}" != "--w-tle" ] && [ -z "${OPERAT_BEZ_TLA:-}" ]; then
  case "${1:-}" in 06|12) ;; *) echo "Podaj kod województwa: 12 (małopolskie) albo 06 (lubelskie)" >&2; exit 2;; esac
  R="${OPERAT_WOJ_DIR:-/var/lib/operat-woj}/$1"; mkdir -p "$R"; curl -fsSL "$B/server/woj_zbieraj.sh" -o "$R/woj_zbieraj.sh"
  systemd-run --unit="operat-woj-$1" --collect --nice=10 --setenv=OPERAT_BASE="$B" /bin/bash "$R/woj_zbieraj.sh" --w-tle "$1" "${2:-}"
  echo "Uruchomione w tle. Możesz zamknąć połączenie. Sprawdzenie stanu: tail -3 $R/stan.txt"; exit 0
fi
[ "${1:-}" = "--w-tle" ] && shift
W="$1"; TRYB="${2:-}"; R="${OPERAT_WOJ_DIR:-/var/lib/operat-woj}/$W"; D="${OPERAT_RCN_OUT:-/var/www/operat-data}/woj/$W"
G=https://opendata.geoportal.gov.pl/InneDane/latest_exports/rcn_transakcje_ceny/PARQUET; PRG="https://opendata.geoportal.gov.pl/prg/adresy/${W}_Punkty_Adresowe.zip"
case "$W" in 06) BBOX=50.20,21.55,52.35,24.20; KAFLE=1;; 12) BBOX=49.15,19.05,50.55,21.45; KAFLE=3;; esac
mkdir -p "$R/kod" "$R/paczki" "$D"; S="$R/stan.txt"; krok() { echo "$(date '+%F %T') $*" | tee -a "$S"; }
[ "$TRYB" = osm ] || : > "$S"; krok "start${TRYB:+ (tylko $TRYB)}"
if [ "$TRYB" != osm ]; then
python3 -c 'import pyarrow' 2>/dev/null || { krok "instaluję pyarrow"; [ -x "$R/venv/bin/python" ] || python3 -m venv "$R/venv"; "$R/venv/bin/pip" -q install pyarrow; }
PY=python3; [ -x "$R/venv/bin/python" ] && PY="$R/venv/bin/python"
for f in rcn_export.py rcn_export_inne.py rcn_paczka.py osm_export.py; do curl -fsSL "$B/tools/$f" -o "$R/kod/$f"; done
krok "pobieram paczki RCN i PRG"
for k in lokale:l budynki:b dzialki:d; do curl -fsSL --retry 3 "$G/${W}_transakcje_ceny_${k%%:*}.parquet" -o "$R/paczki/${k##*:}.parquet"; done; curl -fsSL --retry 3 "$PRG" -o "$R/paczki/prg.zip"
krok "przetwarzam RCN (punkt z RCN, potem adres PRG, potem ULDK dla transakcji od 2021; można przerwać i wznowić)"
"$PY" "$R/kod/rcn_paczka.py" --lokale "$R/paczki/l.parquet" --budynki "$R/paczki/b.parquet" --dzialki "$R/paczki/d.parquet" --prg "$R/paczki/prg.zip" --out "$R/nowe" --uldk "$R/uldk.json" ${OPERAT_ULDK_LIMIT:+--uldk-limit "$OPERAT_ULDK_LIMIT"} >> "$S" 2>&1
cp -f "$R"/nowe/* "$D"/; chmod 755 "$D"; chmod 644 "$D"/*; rm -f "$R"/paczki/*
else
  PY=python3; curl -fsSL "$B/tools/osm_export.py" -o "$R/kod/osm_export.py"
fi
if [ -z "${OPERAT_BEZ_OSM:-}" ]; then
  krok "pobieram OSM dla województwa"
  krok "OSM w $((KAFLE * KAFLE)) częściach na warstwę (mniejsze zapytania, bez błędu 504)"
  if "$PY" "$R/kod/osm_export.py" --out "$D/osm_woj.json.new" --bbox $BBOX --kafle $KAFLE --czas 280 --cache "$R/osm_czesci" >> "$S" 2>&1; then mv -f "$D/osm_woj.json.new" "$D/osm_woj.json"; chmod 644 "$D/osm_woj.json"; rm -rf "$R/osm_czesci"; krok "OSM zapisane"; else rm -f "$D/osm_woj.json.new"; krok "OSM NIEPEŁNE: pobrane części są zapamiętane, uruchom ponownie: bash /tmp/woj.sh $W osm"; fi
fi
krok "KONIEC: $(ls "$D" | wc -l) plików, $(du -sh "$D" | cut -f1)"
