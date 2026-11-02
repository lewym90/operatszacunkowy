#!/usr/bin/env bash
# Testy niewymagające prywatnych danych (używane w CI i lokalnie): jednostkowe + przeglądarkowe na danych syntetycznych.
set -euo pipefail
cd "$(dirname "$0")/.."
SP="${1:-$(mktemp -d)}"
node test/ulice.test.mjs
node test/najemkat.test.mjs
node test/rynek.test.mjs
[ -f test/invest.test.mjs ] && node test/invest.test.mjs
bash test/sync.sh
node test/lock.cjs
node test/geokod.test.mjs
node test/rynek.cjs "$SP"
node test/chips.cjs "$SP"
node test/teczka.cjs "$SP"
node test/raport.cjs "$SP"
node test/kalkulator.cjs "$SP"
node test/osm.cjs
python3 test/osm_analiza_test.py
python3 test/osm_silnik_test.py
echo "WSZYSTKIE TESTY OK"
