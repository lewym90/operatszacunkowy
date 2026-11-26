#!/usr/bin/env bash
# Zebranie ofert Otodom i zapis do bazy aplikacji. Uruchamia właściciel (albo przycisk w aplikacji). Działa w tle: można zamknąć Termius.
#   bash otodom_zbieraj.sh [--proba]                       -> woj. lubelskie (jak dotąd); --proba = wszystko bez zapisu
#   bash otodom_zbieraj.sh --woj malopolskie [--proba]     -> Kraków i okolice
# Postęp: tail -f /var/lib/operat-otodom/log.txt
set -euo pipefail
B="${OPERAT_BASE:-https://lewym90.github.io/operatszacunkowy}"; D=/opt/operat-otodom; L=/var/lib/operat-otodom; ENVF=/etc/operat-sync.env
mkdir -p "$D" "$L"; cd "$D"
if [ "${1:-}" != "--w-tle" ]; then
  [ -r "$ENVF" ] || { echo "Brak $ENVF (serwer synchronizacji)"; exit 1; }
  if systemctl is-active --quiet operat-otodom 2>/dev/null; then echo "Zebranie już trwa. Postęp: tail -f $L/log.txt"; exit 0; fi
  [ -x venv/bin/python ] || python3 -m venv venv
  venv/bin/python -c 'import playwright' 2>/dev/null || venv/bin/pip -q install playwright
  venv/bin/python -m playwright install chromium >/dev/null 2>&1 || venv/bin/python -m playwright install chromium
  curl -fsSL "$B/server/otodom_zbieraj.sh" -o "$D/otodom_zbieraj.sh"; curl -fsSL "$B/tools/otodom_zbieraj.py" -o "$D/otodom_zbieraj.py"
  : > "$L/log.txt"
  systemd-run --unit=operat-otodom --collect --nice=10 -p EnvironmentFile="$ENVF" /bin/bash "$D/otodom_zbieraj.sh" --w-tle "$@" >/dev/null
  echo "Uruchomione w tle. Postęp i wynik:"; echo "  tail -f $L/log.txt"; echo "(wyjście z podglądu: Ctrl+C, zbieranie trwa dalej)"; exit 0
fi
shift
stan() { printf '{"stan":"%s","start":%s,"koniec":%s,"proba":%s,"wynik":%s}\n' "$1" "$START" "${2:-null}" "$PROBA" "$(tail -n 50 "$L/log.txt" | grep '^WYNIK' | tail -1 | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))')" > "$L/stan.json.tmp"; chmod 644 "$L/stan.json.tmp"; mv -f "$L/stan.json.tmp" "$L/stan.json"; }
START=$(date +%s); PROBA=false; case " $* " in *" --proba "*) PROBA=true;; esac; chmod 644 "$L/log.txt"; stan trwa
if "$D/venv/bin/python" -u "$D/otodom_zbieraj.py" "$@" >> "$L/log.txt" 2>&1; then stan gotowe "$(date +%s)"
else echo "WYNIK: PRZERWANE (szczegóły wyżej, w bazie bez zmian, chyba że wyżej jest „Wysyłam”)" >> "$L/log.txt"; stan blad "$(date +%s)"; exit 1; fi
