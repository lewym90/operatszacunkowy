#!/usr/bin/env bash
# Aktualizacja samego programu synchronizacji. Klucz, baza danych i ustawienia zostają bez zmian.
set -euo pipefail
URL=https://lewym90.github.io/operatszacunkowy/server/sync_server.py; F=/opt/operat-sync/sync_server.py; T=$(mktemp)
curl -fsSL "$URL" -o "$T"; python3 -m py_compile "$T"; grep -q "'teczki'" "$T"
cp -p "$F" "$F.bak"; cp "$T" "$F"; rm -f "$T"; systemctl restart operat-sync; sleep 2
systemctl is-active --quiet operat-sync && echo "OK: serwer synchronizacji zaktualizowany" || { cp -p "$F.bak" "$F"; systemctl restart operat-sync; echo "BLAD: przywrocono poprzednia wersje"; exit 1; }
