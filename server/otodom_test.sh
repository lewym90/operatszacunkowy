#!/usr/bin/env bash
# Test dostępu do Otodom z serwera. Osobne środowisko w /opt/operat-otodom; inne aplikacje (także Trendo) nietknięte. Nic nie zapisuje do bazy.
set -euo pipefail
B="${OPERAT_BASE:-https://lewym90.github.io/operatszacunkowy}"; D=/opt/operat-otodom
mkdir -p "$D"; cd "$D"
if [ ! -x venv/bin/python ]; then echo "Przygotowuję osobne środowisko (jednorazowo, 2-4 min)..."; python3 -m venv venv; fi
venv/bin/python -c 'import playwright' 2>/dev/null || venv/bin/pip -q install playwright
venv/bin/python -m playwright install chromium >/dev/null 2>&1 || venv/bin/python -m playwright install chromium
curl -fsSL "$B/tools/otodom_test.py" -o otodom_test.py
echo "Test (ok. 30 s)..."; nice -n 10 venv/bin/python otodom_test.py
