#!/usr/bin/env bash
# Zebranie ofert Otodom (całe woj. lubelskie) i zapis do bazy aplikacji. Uruchamia właściciel. Działa w tle: można zamknąć Termius.
#   bash otodom_zbieraj.sh --proba   -> wszystko bez zapisu (sprawdzenie)
#   bash otodom_zbieraj.sh           -> prawdziwe zebranie
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
  systemd-run --unit=operat-otodom --collect --nice=10 -p EnvironmentFile="$ENVF" /bin/bash "$D/otodom_zbieraj.sh" --w-tle "${1:-}" >/dev/null
  echo "Uruchomione w tle. Postęp i wynik:"; echo "  tail -f $L/log.txt"; echo "(wyjście z podglądu: Ctrl+C, zbieranie trwa dalej)"; exit 0
fi
shift
"$D/venv/bin/python" -u "$D/otodom_zbieraj.py" ${1:+"$1"} >> "$L/log.txt" 2>&1 || { echo "WYNIK: PRZERWANE (szczegóły wyżej, w bazie bez zmian, chyba że wyżej jest „Wysyłam”)" >> "$L/log.txt"; exit 1; }
