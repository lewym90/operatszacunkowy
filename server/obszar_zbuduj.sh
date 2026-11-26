#!/bin/bash
# Składa pliki obszaru pracy aplikacji (np. Kraków i okolice) z danych województwa zebranych przez woj_zbieraj.sh.
# Użycie: obszar_zbuduj.sh krakow   → /var/www/operat-data/krakow/ (rcn_lokale.json, rcn_inne.json, rcn_meta.json, osm.json)
# Lublina i działającej aplikacji nie dotyka. Pliki podmieniane atomowo.
set -euo pipefail
B="${OPERAT_BASE:-https://lewym90.github.io/operatszacunkowy}"; O="${1:-}"
case "$O" in krakow) W=12;; *) echo "Podaj obszar: krakow" >&2; exit 2;; esac
SRC="${OPERAT_RCN_OUT:-/var/www/operat-data}/woj/$W"; OUT="${OPERAT_RCN_OUT:-/var/www/operat-data}/$O"; K="${OPERAT_WOJ_DIR:-/var/lib/operat-woj}/kod"
[ -f "$SRC/rcn_spis.json" ] || { echo "Brak danych województwa w $SRC (najpierw: woj_zbieraj.sh $W)" >&2; exit 1; }
mkdir -p "$K" "$OUT"; curl -fsSL "$B/tools/obszar_plik.py" -o "$K/obszar_plik.py"
python3 "$K/obszar_plik.py" --woj "$SRC" --obszar "$O" --out "$OUT"
chmod 755 "$OUT"; chmod 644 "$OUT"/*
echo "GOTOWE: $(ls "$OUT" | tr '\n' ' ')($(du -sh "$OUT" | cut -f1))"
